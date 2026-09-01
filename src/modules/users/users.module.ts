import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { UsersController } from "./users.controller";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_ACCESS_SECRET"),
        signOptions: { expiresIn: config.get("JWT_ACCESS_EXPIRES", "15m") },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [UsersController],
  exports: [TypeOrmModule],
})
export class UsersModule {}
