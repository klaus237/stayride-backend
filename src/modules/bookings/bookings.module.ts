import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BookingsService } from "./bookings.service";
import { BookingsController } from "./bookings.controller";
import { Booking } from "./entities/booking.entity";
import { BookingExtension } from "./entities/booking-extension.entity";
import { RedisService } from "../../config/redis.service";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, BookingExtension]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_ACCESS_SECRET"),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [BookingsController],
  providers: [BookingsService, RedisService],
  exports: [BookingsService],
})
export class BookingsModule {}
