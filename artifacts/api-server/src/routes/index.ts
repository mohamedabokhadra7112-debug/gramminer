import { Router, type IRouter } from "express";
import healthRouter    from "./health";
import telegramRouter  from "./telegram";
import adminRouter     from "./admin";
import userPrefsRouter from "./userPrefs";
import tasksRouter     from "./tasks";
import withdrawRouter  from "./withdraw";
import manifestRouter  from "./manifest";
import referralsRouter from "./referrals";
import depositsRouter  from "./deposits";
import swapRouter      from "./swap";
import storeRouter     from "./store";

const router: IRouter = Router();

router.use(healthRouter);
router.use(manifestRouter);
// Feature routers registered before telegramRouter so their specific paths
// take precedence over legacy catch-all handlers in telegram.ts
router.use(referralsRouter);
router.use(depositsRouter);
router.use(swapRouter);
router.use(storeRouter);
router.use(telegramRouter);
router.use(adminRouter);
router.use(userPrefsRouter);
router.use(tasksRouter);
router.use(withdrawRouter);

export default router;
