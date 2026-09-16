// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddKnowledgeSheet } from "./add-knowledge-sheet";
import { ImportWebsiteKnowledgeSheet } from "./import-website-knowledge-sheet";
import { UploadKnowledgeDocumentSheet } from "./upload-knowledge-document-sheet";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
afterEach(cleanup);

describe("restored knowledge dialogs", () => {
  it("preserves and saves snippet tags, disabled state and priority", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<AddKnowledgeSheet section="knowledge" mode="edit" open snippet={{ title: "Hours", content: "Weekdays", tags: ["office", "hours"], priority: 42, active: false }} save={save} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText("agent:sections.knowledge.fields.tags.label"), { target: { value: " hours, policy, , " } });
    await userEvent.click(screen.getByRole("button", { name: "agent:actions.saveChanges" }));
    expect(save).toHaveBeenCalledWith({ title: "Hours", content: "Weekdays", tags: ["hours", "policy"], priority: 42, active: false });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("keeps empty snippet submission available but does not write invalid content", async () => {
    const save = vi.fn();
    render(<AddKnowledgeSheet section="knowledge" open save={save} />);
    const button = screen.getByRole("button", { name: "agent:actions.save" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(button);
    expect(save).not.toHaveBeenCalled();
  });
  it("imports a website using only its URL", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ImportWebsiteKnowledgeSheet open save={save} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com/" } });
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.websiteImport.submit" }));
    expect(save).toHaveBeenCalledWith("https://example.com/");
  });
  it("shows required and server website errors, clearing the error when edited", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Import unavailable"));
    render(<ImportWebsiteKnowledgeSheet open save={save} />);
    const submit = screen.getByRole("button", { name: "sections.knowledge.websiteImport.submit" });
    await userEvent.click(submit);
    expect(screen.getByText("sections.knowledge.websiteImport.validation.urlRequired")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com" } });
    expect(screen.queryByText("sections.knowledge.websiteImport.validation.urlRequired")).toBeNull();
    await userEvent.click(submit);
    expect(await screen.findByText("Import unavailable")).toBeTruthy();
  });
  it("requires a file before uploading", async () => {
    const upload = vi.fn();
    render(<UploadKnowledgeDocumentSheet section="knowledge" open upload={upload} />);
    await userEvent.click(screen.getByRole("button", { name: "actions.save" }));
    expect(screen.getByText("sections.knowledge.uploadValidation.fileRequired")).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });
  it("infers an untyped Markdown file and preserves the edited title and tags", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    render(<UploadKnowledgeDocumentSheet section="knowledge" open upload={upload} />);
    const file = new File(["Clinic hours"], "clinic.md");
    fireEvent.change(document.getElementById("knowledge-document-file")!, { target: { files: [file] } });
    expect((screen.getByLabelText("sections.knowledge.fields.title.label") as HTMLInputElement).value).toBe("clinic");
    fireEvent.change(screen.getByLabelText("sections.knowledge.fields.title.label"), { target: { value: "  Clinic policy " } });
    fireEvent.change(screen.getByLabelText("sections.knowledge.fields.tags.label"), { target: { value: "clinic, hours" } });
    await userEvent.click(screen.getByRole("button", { name: "actions.save" }));
    expect(upload).toHaveBeenCalledWith({ file, contentType: "text/markdown", title: "Clinic policy", tags: ["clinic", "hours"] });
  });
  it("rejects oversized and unsupported files before making upload requests", async () => {
    const upload = vi.fn();
    render(<UploadKnowledgeDocumentSheet section="knowledge" open upload={upload} />);
    const large = new File(["x"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(large, "size", { value: 10 * 1024 * 1024 + 1 });
    const input = document.getElementById("knowledge-document-file")!;
    fireEvent.change(input, { target: { files: [large] } });
    expect(screen.getByText("sections.knowledge.uploadValidation.maxSize")).toBeTruthy();
    fireEvent.change(input, { target: { files: [new File(["x"], "bad.exe", { type: "application/octet-stream" })] } });
    await userEvent.click(screen.getByRole("button", { name: "actions.save" }));
    expect(screen.getByText("sections.knowledge.uploadValidation.unsupportedFile")).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });
  it("keeps failed uploads open with the original localized error", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("private storage failure"));
    const close = vi.fn();
    render(<UploadKnowledgeDocumentSheet section="knowledge" open upload={upload} onOpenChange={close} />);
    fireEvent.change(document.getElementById("knowledge-document-file")!, { target: { files: [new File(["x"], "hours.txt", { type: "text/plain" })] } });
    await userEvent.click(screen.getByRole("button", { name: "actions.save" }));
    await waitFor(() => expect(screen.getByText("sections.knowledge.uploadValidation.uploadFailed")).toBeTruthy());
    expect(close).not.toHaveBeenCalled();
  });
});
