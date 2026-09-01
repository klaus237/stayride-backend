import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
