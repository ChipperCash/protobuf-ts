import type {IMessageType, JsonValue} from "@chippercash/protobuf-runtime";
import {lowerCamelCase} from "@chippercash/protobuf-runtime";

/**
 * Describes a protobuf service for runtime reflection.
 */
export interface ServiceInfo {

    /**
     * The protobuf type name of the service, including package name if
     * present.
     */
    readonly typeName: string;

    /**
     * Information for each rpc method of the service, in the order of
     * declaration in the source .proto.
     */
    readonly methods: MethodInfo[];

    /**
     * Contains custom service options from the .proto source in JSON format.
     */
    readonly options: { [extensionName: string]: JsonValue };
}

/**
 * Describes a protobuf service method for runtime reflection.
 */
export interface MethodInfo<I extends object = any, O extends object = any> {

    /**
     * The service this method belongs to.
     */
    readonly service: ServiceInfo

    /**
     * The name of the method as declared in .proto
     */
    readonly name: string;

    /**
     * The name of the method in the runtime.
     */
    readonly localName: string;

    /**
     * The idempotency level as specified in .proto.
     *
     * For example, the following method declaration will set
     * `idempotency` to 'NO_SIDE_EFFECTS'.
     *
     * ```proto
     * rpc Foo (FooRequest) returns (FooResponse) {
     *   option idempotency_level = NO_SIDE_EFFECTS
     * }
     * ```
     *
     * See `google/protobuf/descriptor.proto`, `MethodOptions`.
     */
    readonly idempotency: undefined | 'NO_SIDE_EFFECTS' | 'IDEMPOTENT';

    /**
     * Was the rpc declared with server streaming?
     *
     * Example declaration:
     *
     * ```proto
     * rpc Foo (FooRequest) returns (stream FooResponse);
     * ```
     */
    readonly serverStreaming: boolean;

    /**
     * Was the rpc declared with client streaming?
     *
     * Example declaration:
     *
     * ```proto
     * rpc Foo (stream FooRequest) returns (FooResponse);
     * ```
     */
    readonly clientStreaming: boolean;

    /**
     * The generated type handler for the input message.
     * Provides methods to encode / decode binary or JSON format.
     */
    readonly I: IMessageType<I>;

    /**
     * The generated type handler for the output message.
     * Provides methods to encode / decode binary or JSON format.
     */
    readonly O: IMessageType<O>;

    /**
     * Contains custom method options from the .proto source in JSON format.
     */
    readonly options: { [extensionName: string]: JsonValue };

}


/**
 * Version of `MethodInfo` that does not include "service", and also allows
 * the following properties to be omitted:
 * - "localName": can be omitted if equal to lowerCamelCase(name)
 * - "serverStreaming": omitting means `false`
 * - "clientStreaming": omitting means `false`
 * - "options"
 */
export type PartialMethodInfo<I extends object = any, O extends object = any> =
    PartialPartial<Omit<MethodInfo<I, O>, "service">, "localName" | "idempotency" | "serverStreaming" | "clientStreaming" | "options">;


// Make all properties in T optional, except those whose keys are in the union K.
type PartialPartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;


/**
 * Turns PartialMethodInfo into MethodInfo.
 */
export function normalizeMethodInfo<I extends object = any, O extends object = any>(method: PartialMethodInfo<I, O>, service: ServiceInfo): MethodInfo<I, O> {
    let m = method as any;
    m.service = service;
    m.localName = m.localName ?? lowerCamelCase(m.name);
    // noinspection PointlessBooleanExpressionJS
    m.serverStreaming = !!m.serverStreaming;
    // noinspection PointlessBooleanExpressionJS
    m.clientStreaming = !!m.clientStreaming;
    m.options = m.options ?? {};
    m.idempotency = m.idempotency ?? undefined;
    return m as MethodInfo<I, O>;
}


/**
 * Read custom method options from a generated service client.
 *
 * @deprecated use readMethodOption()
 */
export function readMethodOptions<T extends object>(service: ServiceInfo, methodName: string | number, extensionName: string, extensionType: IMessageType<T>): T | undefined {
    const options = service.methods.find((m, i) => m.localName === methodName || i === methodName)?.options;
    return options && options[extensionName] ? extensionType.fromJson(options[extensionName]) : undefined;
}

/**
 * Read a custom method option.
 *
 * ```proto
 * service MyService {
 *   rpc Get (Req) returns (Res) {
 *      option (acme.rpc_opt) = true;
 *   };
 * }
 * ```
 *
 * ```typescript
 * let val = readMethodOption(MyService, 'get', 'acme.rpc_opt')
 * ```
 */
export function readMethodOption<T extends object>(service: ServiceInfo, methodName: string | number, extensionName: string): JsonValue | undefined;
export function readMethodOption<T extends object>(service: ServiceInfo, methodName: string | number, extensionName: string, extensionType: IMessageType<T>): T | undefined;
export function readMethodOption<T extends object>(service: ServiceInfo, methodName: string | number, extensionName: string, extensionType?: IMessageType<T>): T | JsonValue | undefined {
    const options = service.methods.find((m, i) => m.localName === methodName || i === methodName)?.options;
    if (!options) {
        return undefined;
    }
    const optionVal = options[extensionName];
    if (optionVal === undefined) {
        return optionVal;
    }
    return extensionType ? extensionType.fromJson(optionVal) : optionVal;
}

/**
 * Read a custom service option.
 *
 * ```proto
 * service MyService {
 *   option (acme.service_opt) = true;
 * }
 * ```
 *
 * ```typescript
 * let val = readServiceOption(MyService, 'acme.service_opt')
 * ```
 */
export function readServiceOption<T extends object>(service: ServiceInfo, extensionName: string): JsonValue | undefined;
export function readServiceOption<T extends object>(service: ServiceInfo, extensionName: string, extensionType: IMessageType<T>): T | undefined;
export function readServiceOption<T extends object>(service: ServiceInfo, extensionName: string, extensionType?: IMessageType<T>): T | JsonValue | undefined {
    const options = service.options;
    if (!options) {
        return undefined;
    }
    const optionVal = options[extensionName];
    if (optionVal === undefined) {
        return optionVal;
    }
    return extensionType ? extensionType.fromJson(optionVal) : optionVal;
}
