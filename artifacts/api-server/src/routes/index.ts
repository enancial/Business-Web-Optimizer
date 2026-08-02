import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkoutRouter from "./checkout";
import sendReportRouter from "./sendReport";
import scanRouter from "./scan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkoutRouter);
router.use(sendReportRouter);
router.use(scanRouter);

export default router;
