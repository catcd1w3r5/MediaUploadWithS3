import {IS3Bucket, IS3Object} from "../interfaces";
import config from "../config";
import {S3Lib} from "./s3lib";
import {ExistingObject, MissingObject} from "./Errors";
import {S3BucketInternal} from "./s3BucketInternal";
import {S3ObjectBuilder} from "./s3ObjectBuilder";

export class S3Bucket implements IS3Bucket {
    private internal: S3BucketInternal;

    /**
     * @internal
     * @param lib
     * @param bucketName
     */
    constructor(lib: S3Lib, bucketName: string) {
        this.internal = new S3BucketInternal(lib, bucketName);
    }

    protected async assertExists(key: string): Promise<void> {
        if (!await this.internal.containsObject(key)) throw new MissingObject(key, this.internal.bucketName);
    }

    protected async assertNoConflicts(key: string): Promise<void> {
        if (await this.internal.containsObject(key)) throw new ExistingObject(key, this.internal.bucketName);
    }

    public async createObject(s3Object: S3ObjectBuilder): Promise<IS3Object> {
        await this.assertNoConflicts(s3Object.FileName);
        const size = s3Object.DataSize;
        if (size === undefined) throw new Error("Data size is undefined");
        return size <= config.multipartUploadThreshold ? this.internal.createObject_Single(s3Object) : this.internal.createObject_Multipart(s3Object);
    }

    public async createObjectFromFile(file: File): Promise<IS3Object> {
        const s3Object = await S3ObjectBuilder.fromFile(file);
        return await this.createObject(s3Object);
    }

    public async getObject(key: string): Promise<IS3Object> {
        await this.assertExists(key);
        return this.internal.getObject(key);
    }

    public async deleteObject(key: string): Promise<void> {
        await this.assertExists(key);
        return this.internal.deleteObject(key);
    }

    public async renameObject(oldKey: string, newKey: string): Promise<void> {
        await Promise.all([this.assertNoConflicts(newKey), this.assertExists(oldKey),]);
        return this.internal.renameObject(oldKey, newKey);
    }

    public async getAllObjects(): Promise<IS3Object[]> {
        const objectKeys = await this.internal.listContents();
        const promises = objectKeys.map(key => this.internal.getObject(key));
        return Promise.all(promises);
    }

    contains(key: string): Promise<boolean> {
        return this.internal.containsObject(key);
    }

    listContent(): Promise<Array<string>> {
        return this.internal.listContents();
    }
}
