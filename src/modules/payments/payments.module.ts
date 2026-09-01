import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment } from './entities/payment.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { RedisService } from '../../config/redis.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Booking]), AdminModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RedisService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
