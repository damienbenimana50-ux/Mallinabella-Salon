import { Router, type IRouter } from "express";
import {
  CreateServiceBody,
  CreateServiceResponse,
  DeleteServiceParams,
  DeleteServiceResponse,
  ListServicesResponse,
  ListStylistsResponse,
  UpdateServiceBody,
  UpdateServiceParams,
  UpdateServiceResponse,
} from "@workspace/api-zod";
import { prisma } from "@workspace/db";
import { requireSalonAdmin } from "../../middlewares/requireSalonAdmin";
import { toService } from "../../lib/salon-domain";

const router: IRouter = Router();

router.get("/services", async (_req, res): Promise<void> => {
  const rows = await prisma.service.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  res.json(ListServicesResponse.parse(rows.map(toService)));
});

router.post("/services", requireSalonAdmin, async (req, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const service = await prisma.service.create({ data: parsed.data });
  req.log.info({ serviceId: service.id }, "Salon service created");
  res.status(201).json(CreateServiceResponse.parse(toService(service)));
});

router.patch("/services/:serviceId", requireSalonAdmin, async (req, res): Promise<void> => {
  const params = UpdateServiceParams.safeParse(req.params);
  const body = UpdateServiceBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const service = await prisma.service.findUnique({ where: { id: params.data.serviceId } });
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const updated = await prisma.service.update({
    where: { id: params.data.serviceId },
    data: body.data,
  });
  req.log.info({ serviceId: updated.id }, "Salon service updated");
  res.json(UpdateServiceResponse.parse(toService(updated)));
});

router.delete("/services/:serviceId", requireSalonAdmin, async (req, res): Promise<void> => {
  const params = DeleteServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const service = await prisma.service.findUnique({ where: { id: params.data.serviceId } });
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  // Preserve appointment history; removed services are archived from booking.
  await prisma.service.update({
    where: { id: params.data.serviceId },
    data: { active: false },
  });
  DeleteServiceResponse.parse(undefined);
  res.sendStatus(204);
});

router.get("/stylists", async (_req, res): Promise<void> => {
  const stylists = await prisma.stylist.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true, imageUrl: true },
  });
  res.json(ListStylistsResponse.parse(stylists));
});

export default router;
