import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RevalidationService } from './revalidation.service';
import { RevalidationInterceptor } from './revalidation.interceptor';

@Global()
@Module({
  providers: [
    RevalidationService,
    { provide: APP_INTERCEPTOR, useClass: RevalidationInterceptor },
  ],
  exports: [RevalidationService],
})
export class RevalidationModule {}