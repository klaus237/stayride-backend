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
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles, CurrentUser, Public } from "../../common/decorators";
import { UserRole, PaymentMethod } from "../../common/enums";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  Min,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

class InitiatePaymentDto {
  @ApiProperty() @IsString() bookingId!: string;
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
}

class ConfirmPaymentDto {
  @ApiProperty() @IsNumber() @Min(0) amount_received!: number;
  @ApiProperty() @IsString() reference!: string;
  @ApiProperty() @IsDateString() payment_date!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

class RefundDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

@ApiTags("Payments")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth("JWT-auth")
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── Client ───────────────────────────────────────────────────────────────

  @Post("initiate")
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: "Initier un paiement" })
  async initiate(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser("id") customerId: string,
  ) {
    return this.paymentsService.initiatePayment(
      dto.bookingId,
      dto.method,
      customerId,
      dto.phone,
    );
  }

  @Get(":id/status")
  @ApiOperation({ summary: "Statut d'un paiement" })
  async getStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.paymentsService.getPaymentStatus(id, userId);
  }

  @Get("history")
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: "Historique mes paiements" })
  async getHistory(@CurrentUser("id") userId: string, @Query() query: any) {
    return this.paymentsService.getUserPayments(userId, query);
  }

  // ─── Stripe webhooks (public — signature vérifiée dans le service) ─────────

  @Public()
  @Post("stripe/webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Webhook Stripe" })
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ) {
    await this.paymentsService.handleStripeWebhook(
      req.rawBody as Buffer,
      signature,
    );
    return { received: true };
  }

  @Post("stripe/create-intent")
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: "Créer un PaymentIntent Stripe" })
  async createStripeIntent(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser("id") userId: string,
  ) {
    return this.paymentsService.initiatePayment(
      dto.bookingId,
      PaymentMethod.STRIPE,
      userId,
    );
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  @Get("admin/all")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[Admin] Tous les paiements" })
  async findAll(@Query() query: any) {
    return this.paymentsService.findAllAdmin(query);
  }

  @Patch("admin/:id/confirm")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[Admin] Confirmer réception paiement" })
  async confirm(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser("id") adminId: string,
  ) {
    return this.paymentsService.confirmManual(id, adminId, {
      amount_received: dto.amount_received,
      reference: dto.reference,
      payment_date: dto.payment_date,
      notes: dto.notes,
    });
  }

  @Patch("admin/:id/reject")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[Admin] Rejeter un paiement" })
  async reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
    @CurrentUser("id") adminId: string,
  ) {
    return this.paymentsService.rejectPayment(id, adminId, body.reason);
  }

  @Post("admin/:id/refund")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[Admin] Rembourser un paiement" })
  async refund(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RefundDto,
    @CurrentUser("id") adminId: string,
  ) {
    return this.paymentsService.processRefund(id, adminId, dto.amount);
  }
}
