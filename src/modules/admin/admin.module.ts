import { PlatformSettingEntity } from "./entities/platform-setting.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  AdminSettingsService,
} from "./admin-settings.service";
import { AdminController } from "./admin.controller";
import { RedisService } from "../../config/redis.service";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformSettingEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_ACCESS_SECRET"),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AdminController],
  providers: [AdminSettingsService, RedisService],
  exports: [AdminSettingsService],
})
export class AdminModule {}
