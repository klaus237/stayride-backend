import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AdminSettingsService } from "./admin-settings.service";
import { Public } from "../../common/decorators";

@ApiTags("Admin")
@Controller("platform")
export class AdminController {
  constructor(private readonly settingsService: AdminSettingsService) {}

  @Public()
  @Get("settings")
  async getPublicSettings() {
    return this.settingsService.getPublic();
  }
}
