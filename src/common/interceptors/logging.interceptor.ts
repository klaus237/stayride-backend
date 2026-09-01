import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, user } = req;
    const start = Date.now();
    const userId = user?.id ? `[${user.id.slice(0, 8)}]` : '[guest]';

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          const status = context.switchToHttp().getResponse().statusCode;
          this.logger.log(`${method} ${url} ${userId} → ${status} (${ms}ms)`);
        },
        error: (err) => {
          const ms = Date.now() - start;
          this.logger.warn(`${method} ${url} ${userId} → ERROR (${ms}ms): ${err.message}`);
        },
      }),
    );
  }
}
