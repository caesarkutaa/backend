import { IsEnum, IsOptional } from 'class-validator';
import { AdminListQueryDto } from '../../common/dto/admin-list-query.dto';
import { Role } from '../../common/enums/role.enum';

export enum UserSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  TOP_SPENDERS = 'top_spenders',
  MOST_ORDERS = 'most_orders',
}

/** /admin/users?search=kuta&isActive=false&role=customer&sort=top_spenders */
export class AdminUsersQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserSort)
  sort: UserSort = UserSort.NEWEST;
}