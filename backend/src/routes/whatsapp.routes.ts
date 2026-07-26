import type { FastifyPluginAsync } from "fastify";

import {

  getWhatsAppStatus,

  handleAlternateWhatsAppWebhook,

  handleWhatsAppWebhook,

  verifyWhatsAppWebhook,

} from "../controllers/whatsapp.controller.js";



export const whatsappRoutes: FastifyPluginAsync = async (app) => {

  app.get("/status", getWhatsAppStatus);



  app.addContentTypeParser(

    "application/json",

    { parseAs: "buffer" },

    (request, body, done) => {

      (request as { rawBody?: Buffer }).rawBody = body as Buffer;

      try {

        const json = JSON.parse((body as Buffer).toString("utf8")) as unknown;

        done(null, json);

      } catch (error) {

        done(error as Error, undefined);

      }

    },

  );



  app.get("/webhook", verifyWhatsAppWebhook);

  app.post("/webhook", handleWhatsAppWebhook);

  app.post("/webhook/inbound", handleAlternateWhatsAppWebhook);

};


