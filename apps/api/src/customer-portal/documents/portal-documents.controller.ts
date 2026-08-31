import {
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
import { QueryPortalDocumentsDto } from "../dto/query-portal-documents.dto";
import { PortalDocumentsService } from "./portal-documents.service";

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
};

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/documents")
export class PortalDocumentsController {
  constructor(private readonly portalDocumentsService: PortalDocumentsService) {}

  @Get()
  findMany(@CurrentCustomer() customer: PublicCustomer, @Query() query: QueryPortalDocumentsDto) {
    return this.portalDocumentsService.findMany(customer.tenantId, customer.id, query);
  }

  @Get(":id")
  findOne(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalDocumentsService.findOne(customer.tenantId, customer.id, id);
  }

  @Get(":id/preview")
  preview(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalDocumentsService.preview(customer.tenantId, customer.id, id);
  }

  @Get(":id/pdf")
  async getPdf(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, file } = await this.portalDocumentsService.getPdf(
      customer.tenantId,
      customer.id,
      id,
    );
    res.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(file.originalFileName)}"`,
    );
    res.type("application/pdf").send(buffer);
  }

  @Get(":id/signature-requests")
  listSignatureRequests(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalDocumentsService.listSignatureRequests(customer.tenantId, customer.id, id);
  }

  @Post(":id/signature-requests/:requestId/sign")
  sign(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Param("requestId") requestId: string,
  ) {
    return this.portalDocumentsService.sign(customer.tenantId, customer.id, id, requestId);
  }

  /**
   * Havelio Signature System (docs/PRODUCT_BIBLE.md) — Customer Portal
   * remote signing: the customer draws their own signature (the only
   * method offered here — no "upload"/"use saved" for a customer) while
   * logged into their own portal session. See PortalDocumentsService for
   * the ownership/identity guarantees.
   */
  @Get(":id/signatures")
  listSignatures(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalDocumentsService.listMySignatures(customer.tenantId, customer.id, id);
  }

  @Get(":id/signatures/:evidenceId/file")
  async getSignatureFile(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Param("evidenceId") evidenceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.portalDocumentsService.readMySignatureFile(
      customer.tenantId,
      customer.id,
      id,
      evidenceId,
    );
    res.type(mimeType).send(buffer);
  }

  @Post(":id/signatures")
  @UseInterceptors(FileInterceptor("file", multerOptions))
  captureSignature(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @UploadedFile() file: UploadedFileLike,
  ) {
    return this.portalDocumentsService.captureMySignature(customer.tenantId, customer, id, file);
  }
}
