import { Router, type IRouter } from "express";
import healthRouter    from "./health";
import telegramRouter  from "./telegram";
import adminRouter     from "./admin";
import userPrefsRouter from "./userPrefs";
import tasksRouter     from "./tasks";
import withdrawRouter  from "./withdraw";
import manifestRouter  from "./manifest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(manifestRouter);
router.use(telegramRouter);
router.use(adminRouter);
router.use(userPrefsRouter);
router.use(tasksRouter);
router.use(withdrawRouter);

export default router;
