import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Car } from "./entities/car.entity";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Public, CurrentUser, Roles } from "../../common/decorators";
import { UserRole } from "../../common/enums";

@ApiTags("Cars")
@UseGuards(JwtAuthGuard)
@Controller("cars")
export class CarsController {
  constructor(
    @InjectRepository(Car)
    private readonly carsRepo: Repository<Car>,
  ) {}

  @Public()
  @Get()
  async search(@Query() query: any) {
    const qb = this.carsRepo
      .createQueryBuilder("c")
      .where("c.status = :status", { status: "AVAILABLE" })
      .orderBy("c.is_featured", "DESC")
      .addOrderBy("c.created_at", "DESC");

    if (query.city) {
      qb.andWhere("LOWER(c.city) LIKE LOWER(:city)", {
        city: `%${query.city}%`,
      });
    }
    if (query.category) {
      qb.andWhere("c.category = :category", { category: query.category });
    }
    if (query.maxPrice) {
      qb.andWhere("c.price_per_day <= :maxPrice", { maxPrice: query.maxPrice });
    }
    if (query.transmission) {
      qb.andWhere("c.transmission = :transmission", {
        transmission: query.transmission,
      });
    }

    const page = parseInt(query.page) || 1;
    const perPage = parseInt(query.perPage) || 20;
    qb.skip((page - 1) * perPage).take(perPage);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  @Public()
  @Get("featured")
  async getFeatured() {
    return this.carsRepo.find({
      where: { status: "AVAILABLE", isFeatured: true },
      order: { createdAt: "DESC" },
      take: 10,
    });
  }

  @Public()
  @Get("by-id/:id")
  async getById(@Param("id") id: string) {
    return this.carsRepo.findOne({ where: { id } });
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async create(
    @Body() body: any,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
  ) {
    const slug =
      `${body.brand}-${body.model}-${body.city}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      Date.now().toString(36);

    const car = this.carsRepo.create({
      ...body,
      ownerId: userId,
      slug,
      status: role === UserRole.ADMIN ? "AVAILABLE" : "MAINTENANCE",
    });
    return this.carsRepo.save(car);
  }

  @Get("admin/all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAllAdmin(@Query() query: any) {
    const qb = this.carsRepo
      .createQueryBuilder("c")
      .orderBy("c.created_at", "DESC");
    if (query.status) qb.where("c.status = :status", { status: query.status });
    return qb.getMany();
  }

  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
  ) {
    await this.carsRepo.update(id, { status: body.status as any });
    return { success: true };
  }

  @Public()
  @Get(":slug")
  async getOne(@Param("slug") slug: string) {
    return this.carsRepo.findOne({ where: { slug } });
  }
}
