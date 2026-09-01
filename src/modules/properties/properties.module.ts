import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Property } from "./entities/property.entity";
import { PropertiesController } from "./properties.controller";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forFeature([Property]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_ACCESS_SECRET"),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [PropertiesController],
  exports: [TypeOrmModule],
})
export class PropertiesModule {}
