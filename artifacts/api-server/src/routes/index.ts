import { Router, type IRouter } from "express";
import healthRouter from "./health";
import telegramRouter from "./telegram";
import adminRouter from "./admin";
import userPrefsRouter from "./userPrefs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(telegramRouter);
router.use(adminRouter);
router.use(userPrefsRouter);

export default router;
