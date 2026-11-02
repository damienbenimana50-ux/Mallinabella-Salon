import { Router, type IRouter } from "express";
import healthRouter from "./health";
import salonRouter from "./salon";

const router: IRouter = Router();

router.use(healthRouter);
router.use(salonRouter);

export default router;
