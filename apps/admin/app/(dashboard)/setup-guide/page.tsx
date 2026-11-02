import { redirect } from "next/navigation";

/** Getting started lives on Home now. Old links land there. */
export default function SetupGuidePage() { redirect("/"); }
