import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as compression from "compression";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log", "debug"],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 3000);
  const nodeEnv = configService.get<string>("NODE_ENV", "development");
  const frontendUrl = configService.get<string>(
    "FRONTEND_URL",
    "http://localhost:4200",
  );

  // Sécurité
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(compression());

  // CORS
  app.enableCors({
    origin:
      nodeEnv === "production"
        ? [frontendUrl, "https://stayride.cm", "https://www.stayride.cm"]
        : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept-Language"],
    credentials: true,
  });

  // Préfixe global
  app.setGlobalPrefix("api");

  // Validation globale
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Filtres et intercepteurs globaux
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger (désactivé en production)
  if (nodeEnv !== "production") {
    const config = new DocumentBuilder()
      .setTitle("StayRide API")
      .setDescription(
        "Plateforme de réservation d'appartements et voitures — Cameroun",
      )
      .setVersion("1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "JWT-auth",
      )
      .addTag("Auth", "Authentification et gestion des tokens")
      .addTag("Users", "Profils et vérifications")
      .addTag("Properties", "Appartements meublés")
      .addTag("Cars", "Véhicules")
      .addTag("Bookings", "Réservations")
      .addTag("Payments", "Paiements")
      .addTag("Concierge", "Opérations terrain")
      .addTag("Admin", "Administration plateforme")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`Swagger disponible sur http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  logger.log(`StayRide API démarré sur le port ${port} [${nodeEnv}]`);
}

bootstrap();
