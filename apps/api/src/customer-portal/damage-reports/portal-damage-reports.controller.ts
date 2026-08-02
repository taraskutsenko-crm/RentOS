import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";

import { Public } from "../../auth/decorators/public.decorator";
import { MAX_IMAGE_SIZE_BYTES, type UploadedFileLike } from "../../storage/storage.service";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { CreateDamageReportDto } from "../dto/create-damage-report.dto";
import { PortalDamageReportsService } from "./portal-damage-reports.service";

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
};

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/damage-reports")
export class PortalDamageReportsController {
  constructor(private readonly damageReportsService: PortalDamageReportsService) {}

  @Get()
  findMany(@CurrentCustomer() customer: PublicCustomer, @Query("rentalId") rentalId?: string) {
    return this.damageReportsService.findMany(customer.tenantId, customer.id, rentalId);
  }

  @Get(":id")
  findOne(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.damageReportsService.findOne(customer.tenantId, customer.id, id);
  }

  @Post("rentals/:rentalId")
  create(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("rentalId") rentalId: string,
    @Body() dto: CreateDamageReportDto,
  ) {
    return this.damageReportsService.create(customer.tenantId, customer.id, rentalId, dto);
  }

  @Post(":id/photos")
  @UseInterceptors(FileInterceptor("file", multerOptions))
  uploadPhoto(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @UploadedFile() file: UploadedFileLike,
  ) {
    return this.damageReportsService.uploadPhoto(customer.tenantId, customer.id, id, file);
  }

  @Get(":id/photos/:photoId")
  async getPhoto(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType, fileName } = await this.damageReportsService.readPhoto(
      customer.tenantId,
      customer.id,
      id,
      photoId,
    );
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.type(mimeType).send(buffer);
  }
}
