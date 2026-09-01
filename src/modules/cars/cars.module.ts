import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Car } from "./entities/car.entity";
import { CarsController } from "./cars.controller";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forFeature([Car]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_ACCESS_SECRET"),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [CarsController],
  exports: [TypeOrmModule],
})
export class CarsModule {}
