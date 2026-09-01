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
import { Property } from "./entities/property.entity";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Public, CurrentUser, Roles } from "../../common/decorators";
import { UserRole } from "../../common/enums";

@ApiTags("Properties")
@UseGuards(JwtAuthGuard)
@Controller("properties")
export class PropertiesController {
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepo: Repository<Property>,
  ) {}

  @Public()
  @Get()
  async search(@Query() query: any) {
    const qb = this.propertiesRepo
      .createQueryBuilder("p")
      .where("p.status = :status", { status: "PUBLISHED" })
      .orderBy("p.is_featured", "DESC")
      .addOrderBy("p.created_at", "DESC");

    if (query.city) {
      qb.andWhere(
        "(LOWER(p.city) LIKE LOWER(:city) OR LOWER(p.neighborhood) LIKE LOWER(:city))",
        { city: `%${query.city}%` },
      );
    }

    if (query.lat && query.lng) {
      const lat = parseFloat(query.lat);
      const lng = parseFloat(query.lng);
      const radius = 10;
      qb.andWhere(
        `(6371 * acos(cos(radians(:lat)) * cos(radians(CAST(p.lat AS float))) * cos(radians(CAST(p.lng AS float)) - radians(:lng)) + sin(radians(:lat)) * sin(radians(CAST(p.lat AS float))))) < :radius`,
        { lat, lng, radius },
      );
    }

    if (query.minPrice) {
      qb.andWhere("p.price_per_night >= :minPrice", {
        minPrice: query.minPrice,
      });
    }

    if (query.maxPrice) {
      qb.andWhere("p.price_per_night <= :maxPrice", {
        maxPrice: query.maxPrice,
      });
    }

    if (query.bedrooms) {
      qb.andWhere("p.bedrooms >= :bedrooms", { bedrooms: query.bedrooms });
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
    return this.propertiesRepo.find({
      where: { status: "PUBLISHED", isFeatured: true },
      order: { createdAt: "DESC" },
      take: 10,
    });
  }

  @Public()
  @Get("cities/stats")
  async getCitiesStats() {
    const result = await this.propertiesRepo
      .createQueryBuilder("p")
      .select("p.city", "city")
      .addSelect("COUNT(*)", "count")
      .where("p.status = :status", { status: "PUBLISHED" })
      .groupBy("p.city")
      .orderBy("count", "DESC")
      .getRawMany();

    return result.map((r) => ({
      city: r.city,
      count: parseInt(r.count),
    }));
  }

  @Public()
  @Get("neighborhoods/stats")
  async getNeighborhoodsStats() {
    const result = await this.propertiesRepo
      .createQueryBuilder("p")
      .select("p.neighborhood", "neighborhood")
      .addSelect("p.city", "city")
      .addSelect("COUNT(*)", "count")
      .where("p.status = :status", { status: "PUBLISHED" })
      .andWhere("p.neighborhood IS NOT NULL")
      .groupBy("p.neighborhood")
      .addGroupBy("p.city")
      .orderBy("count", "DESC")
      .getRawMany();

    return result.map((r) => ({
      city: r.neighborhood,
      parentCity: r.city,
      count: parseInt(r.count),
    }));
  }
  @Public()
  @Get("by-id/:id")
  async getById(@Param("id") id: string) {
    return this.propertiesRepo.findOne({ where: { id } });
  }

  @Public()
  @Get(":id/unavailable-dates")
  async getUnavailableDates(@Param("id") id: string) {
    const bookings = await this.propertiesRepo.query(
      `
    SELECT 
      TO_CHAR(start_date, 'YYYY-MM-DD') as start_date,
      TO_CHAR(end_date, 'YYYY-MM-DD') as end_date
    FROM bookings 
    WHERE property_id = $1 
    AND status NOT IN ('CANCELLED', 'REJECTED', 'REFUNDED')
  `,
      [id],
    );

    const dates: string[] = [];
    bookings.forEach((b: any) => {
      const start = new Date(b.start_date + "T00:00:00");
      const end = new Date(b.end_date + "T00:00:00");
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dates.push(`${year}-${month}-${day}`);
      }
    });
    return dates;
  }

  @Public()
  @Post("check-availability")
  async checkAvailability(
    @Body() body: { property_ids: string[]; checkin: string; checkout: string },
  ) {
    if (!body.property_ids?.length) return [];

    const unavailable = await this.propertiesRepo.query(
      `
    SELECT DISTINCT property_id
    FROM bookings 
    WHERE property_id = ANY($1::text[])
    AND status NOT IN ('CANCELLED', 'REJECTED', 'REFUNDED')
    AND start_date < $2::date
    AND end_date > $3::date
  `,
      [body.property_ids, body.checkout, body.checkin],
    );

    return unavailable.map((r: any) => r.property_id);
  }

  @Get("admin/all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAllAdmin(@Query() query: any) {
    const qb = this.propertiesRepo
      .createQueryBuilder("p")
      .orderBy("p.created_at", "DESC");

    if (query.status) qb.where("p.status = :status", { status: query.status });

    const properties = await qb.getMany();
    return properties;
  }

  @Public()
  @Get(":slug")
  async getOne(@Param("slug") slug: string) {
    return this.propertiesRepo.findOne({ where: { slug } });
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
      body.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      Date.now().toString(36);

    const property = this.propertiesRepo.create({
      ...body,
      ownerId: userId,
      slug,
      status: role === UserRole.ADMIN ? "PUBLISHED" : "DRAFT",
    });
    return this.propertiesRepo.save(property);
  }

  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
  ) {
    await this.propertiesRepo.update(id, { status: body.status as any });
    return { success: true };
  }
}
// À ajouter avant la dernière accolade
