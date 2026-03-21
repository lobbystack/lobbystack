import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import rag from "@convex-dev/rag/convex.config";
import resend from "@convex-dev/resend/convex.config";
import persistentTextStreaming from "@convex-dev/persistent-text-streaming/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import crons from "@convex-dev/crons/convex.config";

const app = defineApp();

app.use(agent);
app.use(rag);
app.use(resend);
app.use(persistentTextStreaming);
app.use(workflow);
app.use(workpool, { name: "highPriorityWorkpool" });
app.use(workpool, { name: "bulkWorkpool" });
app.use(actionRetrier);
app.use(crons);

export default app;
