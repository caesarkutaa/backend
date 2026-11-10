import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../../common/enums/order.enum';
import { Trim } from '../../common/utils/transformers';

/** PROCESSING is set automatically when payment is confirmed */
export class UpdateOrderStatusDto {
  @IsIn([OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED], {
    message: 'Status must be shipped, delivered or cancelled',
  })
  status: OrderStatus;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  note?: string;
}