import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkoutRouter from "./checkout";
import sendReportRouter from "./sendReport";
import scanRouter from "./scan";
import billingPortalRouter from "./billingPortal";
import scanTokenRouter from "./scanToken";
import accountRouter from "./account";
import affiliatesRouter from "./affiliates";
import adminAffiliatesRouter from "./adminAffiliates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkoutRouter);
router.use(sendReportRouter);
router.use(scanRouter);
router.use(billingPortalRouter);
router.use(scanTokenRouter);
router.use(accountRouter);
router.use(affiliatesRouter);
router.use(adminAffiliatesRouter);

export default router;
