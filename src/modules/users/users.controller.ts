import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser, Roles } from "../../common/decorators";
import { UserRole } from "../../common/enums";
import { User } from "./entities/user.entity";

@ApiTags("Users")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth("JWT-auth")
@Controller("users")
export class UsersController {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  @Get("me")
  async getMe(@CurrentUser("id") userId: string) {
    return this.usersRepo.findOne({
      where: { id: userId },
      select: [
        "id",
        "email",
        "phone",
        "firstName",
        "lastName",
        "avatarUrl",
        "role",
        "language",
        "isActive",
        "isEmailVerified",
        "referralCode",
        "loyaltyPoints",
        "loyaltyTier",
        "walletBalance",
        "createdAt",
      ],
    });
  }

  @Get("admin/all")
  @Roles(UserRole.ADMIN)
  async getAllUsers(@Query() query: any) {
    const page = parseInt(query.page) || 1;
    const perPage = parseInt(query.perPage) || 20;
    const qb = this.usersRepo
      .createQueryBuilder("u")
      .select([
        "u.id",
        "u.email",
        "u.phone",
        "u.firstName",
        "u.lastName",
        "u.role",
        "u.isActive",
        "u.isEmailVerified",
        "u.createdAt",
        "u.loyaltyPoints",
        "u.walletBalance",
      ])
      .orderBy("u.created_at", "DESC");

    if (query.role) {
      qb.andWhere("u.role = :role", { role: query.role });
    }
    if (query.search) {
      qb.andWhere(
        "(LOWER(u.email) LIKE LOWER(:search) OR LOWER(u.first_name) LIKE LOWER(:search))",
        { search: `%${query.search}%` },
      );
    }

    qb.skip((page - 1) * perPage).take(perPage);
    const [items, total] = await qb.getManyAndCount();
    return {
      data: items,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  @Patch(":id/toggle-active")
  @Roles(UserRole.ADMIN)
  async toggleActive(@Param("id") id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new Error("Utilisateur introuvable");
    await this.usersRepo.update(id, { isActive: !user.isActive });
    return { success: true, isActive: !user.isActive };
  }

  @Patch(":id/role")
  @Roles(UserRole.ADMIN)
  async changeRole(@Param("id") id: string, @Body() body: { role: string }) {
    await this.usersRepo.update(id, { role: body.role as UserRole });
    return { success: true };
  }
}
