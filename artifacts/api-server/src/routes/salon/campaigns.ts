import { Router, type IRouter } from "express";
import {
  CreateCampaignBody,
  CreateCampaignResponse,
  ListCampaignsResponse,
  SendCampaignParams,
  SendCampaignResponse,
} from "@workspace/api-zod";
import { prisma } from "@workspace/db";
import { requireSalonAdmin } from "../../middlewares/requireSalonAdmin";
import { toCampaign } from "../../lib/salon-domain";
import { dispatchMockEmail, promotionEmail } from "../../lib/salon-email";

const router: IRouter = Router();

router.get("/campaigns", requireSalonAdmin, async (_req, res): Promise<void> => {
  const campaigns = await prisma.promotionCampaign.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(ListCampaignsResponse.parse(campaigns.map(toCampaign)));
});

router.post("/campaigns", requireSalonAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const campaign = await prisma.promotionCampaign.create({
    data: {
      subject: parsed.data.subject.trim(),
      body: parsed.data.body.trim(),
    },
  });
  req.log.info({ campaignId: campaign.id }, "Salon promotion draft created");
  res.status(201).json(CreateCampaignResponse.parse(toCampaign(campaign)));
});

router.post(
  "/campaigns/:campaignId/send",
  requireSalonAdmin,
  async (req, res): Promise<void> => {
    const params = SendCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const draft = await prisma.promotionCampaign.findUnique({
      where: { id: params.data.campaignId },
    });
    if (!draft) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (draft.status === "sent") {
      const result = {
        campaign: toCampaign(draft),
        recipientCount: draft.recipientCount,
        deliveryMode: "mock",
      };
      res.json(SendCampaignResponse.parse(result));
      return;
    }

    const recipients = await prisma.user.findMany({
      where: { role: "client", marketingOptIn: true },
      select: { email: true },
    });
    const sentAt = new Date();
    const claimed = await prisma.promotionCampaign.updateMany({
      where: { id: draft.id, status: "draft" },
      data: { status: "sent", recipientCount: recipients.length, sentAt },
    });
    const campaign = await prisma.promotionCampaign.findUnique({
      where: { id: draft.id },
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (claimed.count > 0) {
      for (const recipient of recipients) {
        dispatchMockEmail(
          req.log,
          promotionEmail({
            to: recipient.email,
            subject: campaign.subject,
            body: campaign.body,
          }),
        );
      }
      req.log.info(
        { campaignId: campaign.id, recipientCount: recipients.length },
        "Promotion campaign rendered for opted-in clients; delivery remains in mock mode",
      );
    }
    const result = {
      campaign: toCampaign(campaign),
      recipientCount: campaign.recipientCount,
      deliveryMode: "mock",
    };
    res.json(SendCampaignResponse.parse(result));
  },
);

export default router;
