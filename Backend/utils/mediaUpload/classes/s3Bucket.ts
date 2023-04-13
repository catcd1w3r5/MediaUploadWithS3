import {
    CreateMultipartUploadCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3
} from "@aws-sdk/client-s3";
import {Readable} from "stream";
import {S3Object} from "./s3Object";
import {Metadata} from "./Metadata";
import {IS3Bucket, IS3Object} from "../interfaces";
import config from "../config";
import {MissingObject} from "./Errors";

export class S3Bucket implements IS3Bucket {
    private s3: S3;
    private readonly bucketName: string;
    private readonly getPublicUrlInternal: (key: string) => string;

    /**
     * @internal
     * @param s3
     * @param stringUrl
     * @param bucketName
     */
    constructor(s3: S3, stringUrl: string, bucketName: string) {
        this.s3 = s3;
        this.bucketName = bucketName;
        this.getPublicUrlInternal = (key: string) => {
            return `${stringUrl}/${key}`;
        }
    }

    public async createObject(s3Object: S3Object): Promise<void> {
        const size = s3Object.DataSize;
        if (size === undefined) throw new Error("Data size is undefined");

        const command = (size <= config.multipartUploadThreshold) ?
            new PutObjectCommand({
                Bucket: this.bucketName,
                Key: s3Object.FileName,
                Body: s3Object.Body,
                Metadata: s3Object.Metadata.toRecord()
            }) :
            new CreateMultipartUploadCommand({
                Bucket: this.bucketName,
                Key: s3Object.FileName,
                Metadata: s3Object.Metadata.toRecord()
            });
        await this.s3.send(command);
    }

    public async createObjectFromFile(file: File): Promise<IS3Object> {
        const s3Object = await S3Object.fromFile(file);
        await this.createObject(s3Object);
        return s3Object;
    }

    public async getObject(key: string): Promise<IS3Object> {
        const command = new GetObjectCommand({Bucket: this.bucketName, Key: key});
        const response = await this.s3.send(command);
        return new S3Object(response.Body as Readable, new Metadata(response.Metadata));
    }

    public async deleteObject(key: string): Promise<void> {
        const command = new DeleteObjectCommand({Bucket: this.bucketName, Key: key});
        await this.s3.send(command);
    }

    public async listObjects(): Promise<Array<string>> {
        const command = new ListObjectsV2Command({Bucket: this.bucketName});
        const response = await this.s3.send(command);
        // if response.Contents is not null, then map the array to get the keys
        // else return an empty array
        return response.Contents ? response.Contents.map(content => content.Key || "[unknown]") : [];
    }

    public async listObjectsUrls(): Promise<Array<string>> {
        const objects = await this.listObjects();
        return objects.map(object => this.getPublicUrlInternal(object));
    }

    //todo
    public async changeAccessPolicy(): Promise<void> {
        throw new Error("Not implemented");
    }

    public async containsObject(key: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({Bucket: this.bucketName, Key: key});
            await this.s3.send(command);
            return true;
        } catch (error) {
            if (error.name === "NotFound") return false;
            throw error;
        }
    }

    public async getPublicUrl(key: string): Promise<string> {
        if (!await this.containsObject(key))
            throw new MissingObject(key, this.bucketName);
        return this.getPublicUrlInternal(key);
    }
}
