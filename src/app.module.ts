import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { PropertiesModule } from "./modules/properties/properties.module";
import { CarsModule } from "./modules/cars/cars.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { ConciergeModule } from "./modules/concierge/concierge.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
// import { MessagesModule } from './modules/messages/messages.module';
// import { ReviewsModule } from './modules/reviews/reviews.module';
import { LoyaltyModule } from "./modules/loyalty/loyalty.module";
import { StorageModule } from "./modules/storage/storage.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { AdminModule } from "./modules/admin/admin.module";

@Module({
  controllers: [AppController],
  imports: [
    // Config globale
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),

    // PostgreSQL via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get("DB_HOST", "localhost"),
        port: config.get<number>("DB_PORT", 5432),
        database: config.get("DB_NAME"),
        username: config.get("DB_USER"),
        password: config.get("DB_PASSWORD"),
        entities: [__dirname + "/modules/**/*.entity{.ts,.js}"],
        migrations: [__dirname + "/database/migrations/*{.ts,.js}"],
        synchronize: config.get("DB_SYNCHRONIZE", "false") === "true",
        logging: config.get("NODE_ENV") === "development",
        ssl:
          config.get("NODE_ENV") === "production"
            ? { rejectUnauthorized: false }
            : false,
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>("THROTTLE_TTL", 60) * 1000,
          limit: config.get<number>("THROTTLE_LIMIT", 100),
        },
      ],
      inject: [ConfigService],
    }),

    // Événements métier découplés
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: ".",
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // Tâches planifiées (cron)
    ScheduleModule.forRoot(),

    // Modules fonctionnels
    AuthModule,
    UsersModule,
    PropertiesModule,
    CarsModule,
    BookingsModule,
    PaymentsModule,
    ConciergeModule,
    NotificationsModule,
    // MessagesModule,
    // ReviewsModule,
    LoyaltyModule,
    StorageModule,
    SchedulerModule,
    AdminModule,
  ],
})
export class AppModule {}
