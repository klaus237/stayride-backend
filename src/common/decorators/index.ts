import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

// Récupère l'utilisateur connecté depuis la requête
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

// Définit les rôles autorisés pour un endpoint
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// Marque un endpoint comme public (bypass JwtAuthGuard)
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Marque un endpoint comme nécessitant un audit log
export const AUDIT_KEY = 'audit';
export const Audit = (action: string) => SetMetadata(AUDIT_KEY, action);
