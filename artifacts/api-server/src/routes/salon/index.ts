import { Router, type IRouter } from "express";
import appointmentsRouter from "./appointments";
import campaignsRouter from "./campaigns";
import clientsRouter from "./clients";
import servicesRouter from "./services";

const router: IRouter = Router();

router.use(appointmentsRouter);
router.use(campaignsRouter);
router.use(clientsRouter);
router.use(servicesRouter);

export default router;
