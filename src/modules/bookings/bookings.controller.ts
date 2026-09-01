import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BookingsService } from "./bookings.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser, Roles } from "../../common/decorators";
import { UserRole } from "../../common/enums";
import { CreateBookingDto, CancelBookingDto } from "./dto/create-booking.dto";

@ApiTags("Bookings")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth("JWT-auth")
@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser("id") customerId: string,
  ) {
    return this.bookingsService.create(dto, customerId);
  }

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.bookingsService.findAll(user, query);
  }

  @Get(":id")
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: UserRole,
  ) {
    return this.bookingsService.findOne(id, userId, role);
  }

  @Patch(":id/cancel")
  async cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancel(id, user, dto.reason);
  }

  @Post(":id/extend")
  @Roles(UserRole.CUSTOMER)
  async extend(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: any,
    @CurrentUser("id") customerId: string,
  ) {
    return this.bookingsService.extend(id, dto, customerId);
  }
}
