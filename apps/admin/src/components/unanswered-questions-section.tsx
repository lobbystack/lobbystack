"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestionMark } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

export type UnansweredQuestion = { id: string; question: string; timesAsked: number; firstAskedAt: string; lastAskedAt: string; lastChannel: string };
export type UnansweredQuestions = { questions: UnansweredQuestion[]; openCount: number };

/** The element the Home page links to. */
export const UNANSWERED_QUESTIONS_ANCHOR = "unanswered-questions";

// The domain's MAX_UNANSWERED_ANSWER_LENGTH.
const MAX_ANSWER_LENGTH = 5_000;

const errorCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

export const unansweredQuestionsQueryKey = (businessId: string | undefined) => ["unanswered-questions", businessId] as const;

export function fetchUnansweredQuestions(businessId: string): Promise<UnansweredQuestions> {
  return requestJson<UnansweredQuestions>(`/api/knowledge/questions?businessId=${encodeURIComponent(businessId)}`);
}

/**
 * Open questions the receptionist found no knowledge for, most asked first. Owners and admins answer or dismiss them.
 * Home links here by anchor, but the section renders after the page loads, so it scrolls itself into view once the
 * content above it (`layoutSettled`) and its own list have loaded.
 */
export function UnansweredQuestionsSection({ businessId, canManage, layoutSettled = true }: { businessId: string; canManage: boolean; layoutSettled?: boolean }) {
  const { i18n, t } = useTranslation("knowledge");
  const queryClient = useQueryClient();
  const [answering, setAnswering] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // The answer box opens on a click of Answer, so the cursor goes there.
  const focusOnOpen = useCallback((node: HTMLTextAreaElement | null) => node?.focus(), []);
  const questions = useQuery({ queryKey: unansweredQuestionsQueryKey(businessId), queryFn: () => fetchUnansweredQuestions(businessId) });
  const refresh = async (answered: boolean) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: unansweredQuestionsQueryKey(businessId) }),
      ...(answered ? [queryClient.invalidateQueries({ queryKey: ["knowledge-snippets", businessId] })] : []),
    ]);
  };
  // Someone else answered or dismissed it first: show the list as it is now.
  const alreadyHandled = async () => { toast.info(t("unansweredQuestions.toast.alreadyHandled")); await refresh(false); };
  const resolve = (questionId: string, body: { action: "answer"; answer: string } | { action: "dismiss" }) =>
    requestJson(`/api/knowledge/questions/${encodeURIComponent(questionId)}?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", body: JSON.stringify(body) });
  const answer = useMutation({
    mutationFn: ({ questionId, text }: { questionId: string; text: string }) => resolve(questionId, { action: "answer", answer: text }),
    onSuccess: async () => { setAnswering(null); setDraft(""); toast.success(t("unansweredQuestions.toast.answered")); await refresh(true); },
    onError: async (error) => {
      // A too-long answer shows at the answer box.
      if (errorCode(error) === "answer_too_long") return;
      if (errorCode(error) === "question_resolved") { setAnswering(null); setDraft(""); await alreadyHandled(); return; }
      toast.error(t("common:errors.unexpected"));
    },
  });
  const dismiss = useMutation({
    mutationFn: (questionId: string) => resolve(questionId, { action: "dismiss" }),
    onSuccess: async () => { toast.success(t("unansweredQuestions.toast.dismissed")); await refresh(false); },
    onError: async (error) => {
      if (errorCode(error) === "question_resolved") { await alreadyHandled(); return; }
      toast.error(t("common:errors.unexpected"));
    },
  });
  const answerTooLong = answer.isError && errorCode(answer.error) === "answer_too_long";
  const locale = intlLocale(i18n.resolvedLanguage ?? i18n.language);
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const open = questions.data?.questions ?? [];
  const sectionRef = useRef<HTMLElement>(null);
  const scrolled = useRef(false);
  const settled = layoutSettled && !questions.isLoading;
  useEffect(() => {
    if (!settled || scrolled.current) return;
    // Only the first settled render scrolls, so the page stays put as the table above changes.
    scrolled.current = true;
    if (window.location.hash === `#${UNANSWERED_QUESTIONS_ANCHOR}`) sectionRef.current?.scrollIntoView({ block: "start" });
  }, [settled]);

  return <section aria-labelledby={`${UNANSWERED_QUESTIONS_ANCHOR}-title`} className="flex scroll-mt-20 flex-col gap-3 md:scroll-mt-6" id={UNANSWERED_QUESTIONS_ANCHOR} ref={sectionRef}>
    <div className="flex items-start justify-between gap-4 px-1">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="type-section-title" id={`${UNANSWERED_QUESTIONS_ANCHOR}-title`}>{t("unansweredQuestions.title")}</h2>
      </div>
      {questions.isLoading ? <Skeleton className="h-6 w-12 rounded-full" /> : <Badge variant="outline">{(questions.data?.openCount ?? 0).toLocaleString(locale)}</Badge>}
    </div>
    {questions.isLoading ? <Card className="border-border/70"><CardContent className="flex flex-col gap-4">{Array.from({ length: 3 }, (_, index) => <div className="flex flex-col gap-2" key={index}><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>)}</CardContent></Card>
      : questions.isError ? <p className="px-1 text-sm text-destructive">{t("unansweredQuestions.loadFailed")}</p>
      : open.length ? <Card className="ph-mask border-border/70"><CardContent><ItemGroup>
        {open.map((question, index) => {
          const editing = answering === question.id;
          return <Fragment key={question.id}>
            <Item className="px-0">
              <ItemMedia variant="icon"><MessageCircleQuestionMark className="text-muted-foreground" /></ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-none break-words">{question.question}</ItemTitle>
                <ItemDescription>{t("unansweredQuestions.askedSummary", { asked: t("unansweredQuestions.timesAsked", { count: question.timesAsked }), lastAsked: t("unansweredQuestions.lastAsked", { date: formatDate(question.lastAskedAt) }) })}</ItemDescription>
              </ItemContent>
              {canManage && !editing ? <ItemActions>
                <Button onClick={() => { setAnswering(question.id); setDraft(""); answer.reset(); }} size="sm" type="button" variant="outline">{t("unansweredQuestions.answer")}</Button>
                <Button loading={dismiss.isPending && dismiss.variables === question.id} onClick={() => dismiss.mutate(question.id)} size="sm" type="button" variant="ghost">{t("unansweredQuestions.dismiss")}</Button>
              </ItemActions> : null}
              {canManage && editing ? <ItemFooter className="flex-col items-stretch gap-2">
                <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) answer.mutate({ questionId: question.id, text: draft }); }}>
                  <Textarea aria-describedby={answerTooLong ? `answer-error-${question.id}` : undefined} aria-invalid={answerTooLong || undefined} aria-label={t("unansweredQuestions.answerLabel", { question: question.question })} maxLength={MAX_ANSWER_LENGTH} onChange={(event) => { setDraft(event.target.value); if (answerTooLong) answer.reset(); }} placeholder={t("unansweredQuestions.answerPlaceholder")} ref={focusOnOpen} rows={3} value={draft} />
                  {answerTooLong ? <FieldError id={`answer-error-${question.id}`}>{t("unansweredQuestions.answerTooLong", { max: MAX_ANSWER_LENGTH.toLocaleString(locale) })}</FieldError> : null}
                  <div className="flex justify-end gap-2">
                    <Button disabled={answer.isPending} onClick={() => setAnswering(null)} size="sm" type="button" variant="ghost">{t("unansweredQuestions.cancel")}</Button>
                    <Button disabled={!draft.trim()} loading={answer.isPending} size="sm" type="submit">{t("unansweredQuestions.saveAnswer")}</Button>
                  </div>
                </form>
              </ItemFooter> : null}
            </Item>
            {index < open.length - 1 ? <Separator /> : null}
          </Fragment>;
        })}
      </ItemGroup></CardContent></Card>
      : <div className="rounded-xl border border-dashed p-8 text-center"><p className="type-empty-title">{t("unansweredQuestions.emptyTitle")}</p><p className="type-empty-description mt-2">{t("unansweredQuestions.emptyDescription")}</p></div>}
  </section>;
}
