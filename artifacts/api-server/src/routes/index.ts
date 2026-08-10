import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import reportsRouter from "./reports";
import officersRouter from "./officers";
import adminRouter from "./admin";
import uploadsRouter from "./uploads";
import panchayatRouter from "./panchayat";
import notificationsRouter from "./notifications";
import hierarchyRouter from "./hierarchy";
import controlCenterStaffRouter from "./control-center-staff";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(reportsRouter);
router.use(officersRouter);
router.use(adminRouter);
router.use(panchayatRouter);
router.use(uploadsRouter);
router.use(notificationsRouter);
router.use(hierarchyRouter);
router.use(controlCenterStaffRouter);

export default router;
