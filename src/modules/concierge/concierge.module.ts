import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConciergeService } from './concierge.service';
import { Task } from './entities/task.entity';
import { ConciergeAssignment } from './entities/concierge-assignment.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Task, ConciergeAssignment, Booking]), StorageModule],
  providers: [ConciergeService],
  exports: [ConciergeService],
})
export class ConciergeModule {}
