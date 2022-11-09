import {
  addCommentBlockAsJsDoc,
  AnyTypeDescriptorProto,
  DescriptorRegistry,
  FileDescriptorProto,
  ServiceDescriptorProto,
  SymbolTable,
  TypescriptFile,
  TypeScriptImports,
  typescriptLiteralFromValue
} from "@chippercash/protobuf-plugin-framework";
import { Interpreter } from "../interpreter";
import { CommentGenerator } from "./comment-generator";
import * as ts from "typescript";
import { MethodInfoGenerator } from "./method-info-generator";
import { GeneratorBase } from "./generator-base";
import { OutFile } from "../out-file";
import { FileTable } from "../file-table";
import { InternalOptions } from "../our-options";
import { camelToUnderscore } from "./util";

let kindConfigMap = new Map<string, string>([
  ["ACTION", "Action"],
  ["TASK", "Task"],
  ["QUESTION", "Question"],
  ["EVENT", "Event"],
]);

let kindCollectionMap = new Map<string, string>([
  ["ACTION", "Actions"],
  ["TASK", "Tasks"],
  ["QUESTION", "Questions"],
  ["EVENT", "Events"],
]);

const qetaKindOptionName = "chipper.qeta.kind"
const qetaKindTypeName = ".chipper.qeta.QetaKind"

export class ServiceTypeGenerator extends GeneratorBase {

  private readonly methodInfoGenerator: MethodInfoGenerator;


  constructor (symbols: SymbolTable, registry: DescriptorRegistry, imports: TypeScriptImports, comments: CommentGenerator, interpreter: Interpreter,
    private readonly options: {
      runtimeRpcImportPath: string;
    }) {
    super(symbols, registry, imports, comments, interpreter);
    this.methodInfoGenerator = new MethodInfoGenerator(this.registry, this.imports)
  }


  // export const Haberdasher = new ServiceType("spec.haberdasher.Haberdasher", [
  //     { name: "MakeHat", localName: "makeHat", I: Size, O: Hat },
  // ], {});
  generateServiceType (source: TypescriptFile, descriptor: ServiceDescriptorProto): void {

    const
      // identifier for the service
      MyService = this.imports.type(source, descriptor),
      ServiceType = this.imports.name(source, "ServiceType", this.options.runtimeRpcImportPath),
      interpreterType = this.interpreter.getServiceType(descriptor);

    const args: ts.Expression[] = [
      ts.createStringLiteral(interpreterType.typeName),
      this.methodInfoGenerator.createMethodInfoLiterals(source, interpreterType.methods)
    ];

    if (Object.keys(interpreterType.options).length) {
      args.push(
        typescriptLiteralFromValue(interpreterType.options)
      );
    }

    const exportConst = ts.createVariableStatement(
      [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.createVariableDeclarationList(
        [ts.createVariableDeclaration(
          ts.createIdentifier(MyService),
          undefined,
          ts.createNew(
            ts.createIdentifier(ServiceType),
            undefined,
            args
          )
        )],
        ts.NodeFlags.Const
      )
    );

    // add to our file
    source.addStatement(exportConst);

    // add comments
    let comment = this.comments.makeDeprecatedTag(descriptor);
    comment += this.comments.makeGeneratedTag(descriptor).replace("@generated from ", "@generated ServiceType for ");
    addCommentBlockAsJsDoc(exportConst, comment);

    return;
  }

  generateQetaServiceConfig (source: TypescriptFile, descriptor: ServiceDescriptorProto): void {
    let qetaKindDescriptor: AnyTypeDescriptorProto | undefined
    const MyService = this.imports.type(source, descriptor);
    const interpreterType = this.interpreter.getServiceType(descriptor);
    const propertySignatures: ts.TypeElement[] = []
    const propertyAssignments: ts.PropertyAssignment[] = []
    let i = 0
    for (const method of descriptor.method) {
      /* Properties for Qeta config interface e.g.
         interface SagaServiceConfig {
          GetSagaQuestion: {
              request: GetSagaQuestionRequest;
              response: GetSagaQuestionResponse;
          };
          ...
        }
      */
      const options = interpreterType.methods[i].options
      let kind: string | undefined
      for (const [optionName, value] of Object.entries(options)) {
        if (optionName === qetaKindOptionName) {
          kind = value!.toString()
          qetaKindDescriptor = this.registry.resolveTypeName(qetaKindTypeName)
        }
      }
      i++
        
      const propSignature = ts.createPropertySignature(
        undefined,
        ts.createIdentifier(method.name!),
        undefined,
        ts.createTypeLiteralNode([
          ts.createPropertySignature(
            undefined,
            ts.createIdentifier("request"),
            undefined,
            ts.createTypeReferenceNode(
              ts.createIdentifier(this.imports.type(
                source,
                this.registry.resolveTypeName(method.inputType!)
              )),
              undefined
            ),
            undefined
          ),
          ts.createPropertySignature(
            undefined,
            ts.createIdentifier("response"),
            undefined,
            ts.createTypeReferenceNode(
              ts.createIdentifier(this.imports.type(
                source,
                this.registry.resolveTypeName(method.outputType!)
              )),
              undefined
            ),
            undefined
          ),
          ts.createPropertySignature(
            undefined,
            ts.createIdentifier("kind"),
            undefined,
            qetaKindDescriptor ?
              ts.createTypeReferenceNode(
                ts.createQualifiedName(
                  ts.createIdentifier(this.imports.type(
                    source,
                    qetaKindDescriptor
                  )),
                  ts.createIdentifier(kind!)
                ),
                undefined
              )
              :
              ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
            ,
            undefined
          )
        ]),
        undefined
      )
      propertySignatures.push(propSignature);
      /* Properties for Qeta config object, e.g. 
        export const SagaServiceConfig = {
          GetSagaQuestion: {
              request: GetSagaQuestionRequest,
              response: GetSagaQuestionResponse,
          },
          ...
        }
      */
      const propAssignment = ts.createPropertyAssignment(
        ts.createIdentifier(method.name!),
        ts.createObjectLiteral(
          [
            ts.createPropertyAssignment(
              ts.createIdentifier("request"),
              ts.createIdentifier(this.imports.type(
                source,
                this.registry.resolveTypeName(method.inputType!)
              ))
            ),
            ts.createPropertyAssignment(
              ts.createIdentifier("response"),
              ts.createIdentifier(this.imports.type(
                source,
                this.registry.resolveTypeName(method.outputType!)
              ))
            ),
            ts.createPropertyAssignment(
              ts.createIdentifier("kind"),
              qetaKindDescriptor ?
                ts.createPropertyAccess(
                  ts.createIdentifier(this.imports.type(
                    source,
                    qetaKindDescriptor
                  )),
                  ts.createIdentifier(kind!)
                )
                :
                typescriptLiteralFromValue(kind)
            )
          ],
          true
        )
      )
      propertyAssignments.push(propAssignment)
      // Imports {Request}$Type class.
      this.imports.type(
        source,
        this.registry.resolveTypeName(method.inputType!), 'message-class'
      )
      // Imports {Response}$Type class.
      this.imports.type(
        source,
        this.registry.resolveTypeName(method.outputType!), 'message-class'
      )
    }

    const configInterface = ts.createInterfaceDeclaration(
      undefined,
      [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.createIdentifier(`${MyService}Config`),
      undefined,
      undefined,
      propertySignatures
    )

    const configObject = ts.createVariableStatement(
      [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.createVariableDeclarationList(
        [ts.createVariableDeclaration(
          ts.createIdentifier(`${MyService}Parsers`),
          undefined,
          ts.createAsExpression(
            ts.createObjectLiteral(
              propertyAssignments,
              true
            ),
            ts.createTypeReferenceNode(
              ts.createIdentifier("const"),
              undefined
            )
          )
        )],
        ts.NodeFlags.Const
      )
    )
    // add to our file
    source.addStatement(configInterface);
    source.addStatement(configObject)
    return;
  }

  generateQetaSubscribers (
    descriptor: ServiceDescriptorProto,
    fileTable: FileTable,
    fileDescriptor: FileDescriptorProto,
    registry: DescriptorRegistry,
    options: InternalOptions): OutFile[]
  {
    const files: OutFile[] = []
    let i = 0;
    for (const method of descriptor.method) {
      const methodName = method.name!
      const source = new OutFile(
        fileTable.get(fileDescriptor, `${camelToUnderscore(methodName)}_subscriber`).name, fileDescriptor, registry, options);
      const interpreterType = this.interpreter.getServiceType(descriptor);
      let kind: string | undefined
      for (const [optionName, value] of Object.entries(interpreterType.methods[i].options)) {
        if (optionName === qetaKindOptionName) {
          kind = value?.toString()
        }
      }
      i++
      // NB: Uncomment this to test locally. protobufts-plugin.spec.ts does not populate options info.
      // kind = "ACTION"
      if (kind) {
        const pluralLowerCaseKind = `${kind?.toLowerCase()}s`
        this.imports.name(source, pluralLowerCaseKind, "@chippercash/chipper-common")
        source.addStatement(this.generateSubcriberConfigStatement(methodName, kind))
        source.addStatement(this.generateSubcriberTypeReferenceStatement("Request", methodName, "Params", kind))
        const hasResponse: boolean = kind === "ACTION" || kind === "QUESTION"
        if (hasResponse) {
          source.addStatement(this.generateSubcriberTypeReferenceStatement("Response", methodName, "Response", kind))
        }
        source.addStatement(this.generateSubscriberHandlerDeclaration(hasResponse))
        source.addStatement(this.generateExportSubscriberStatement(kind))
      }
      files.push(source)
    }
    return files
  }

  generateQetaPublishers (
    descriptor: ServiceDescriptorProto,
    fileTable: FileTable,
    fileDescriptor: FileDescriptorProto,
    registry: DescriptorRegistry,
    options: InternalOptions): OutFile[]
  {
    const files: OutFile[] = []
    let i = 0;
    for (const method of descriptor.method) {
      const methodName = method.name!
      const source = new OutFile(
        fileTable.get(fileDescriptor, `${camelToUnderscore(methodName)}_publisher`).name, fileDescriptor, registry, options);
      const MyService = this.imports.type(source, descriptor);
      const interpreterType = this.interpreter.getServiceType(descriptor);
      this.imports.name(source, "QetaQueueManager", "@chippercash/chipper-mq")
      this.imports.name(source, "MessagePublishSettings", "@chippercash/chipper-mq")
      this.imports.name(source, "Services", "../services")
      let kind: string | undefined
      for (const [optionName, value] of Object.entries(interpreterType.methods[i].options)) {
        if (optionName === qetaKindOptionName) {
          kind = value?.toString()
        }
      }
      i++
      // NB: Uncomment this to test locally. protobufts-plugin.spec.ts does not populate options info.
      // kind = "ACTION"
      if (kind) {
        const kindName = kindConfigMap.get(kind)!
        const kindConfigName = `${kindName}Config`
        const kindCollectionName = kindCollectionMap.get(kind)!
        this.imports.name(source, kindConfigName, "@chippercash/chipper-mq")
        this.imports.name(source, kindCollectionName, `./${kindCollectionName.toLowerCase()}`)
        
        const exportParamsStatement = ts.createTypeAliasDeclaration(
          undefined,
          [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
          ts.createIdentifier("Params"),
          undefined,
          ts.createTypeReferenceNode(
            ts.createIdentifier(this.imports.type(
              source,
              this.registry.resolveTypeName(method.inputType!)
            )),
            undefined
          )
        )
        source.addStatement(exportParamsStatement)
        const requestResponseConfig: boolean = kind === "ACTION" || kind === "QUESTION"
        if (requestResponseConfig) {
          const exportResponseStatement = ts.createTypeAliasDeclaration(
            undefined,
            [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.createIdentifier("Response"),
            undefined,
            ts.createTypeReferenceNode(
              ts.createIdentifier(this.imports.type(
                source,
                this.registry.resolveTypeName(method.outputType!)
              )),
              undefined
            )
          )
          source.addStatement(exportResponseStatement)
        }

        const cfgStatement = requestResponseConfig 
          ? this.createRequestResponseConfigStatement(kind, kindConfigName, kindCollectionName, methodName, MyService)
          : this.createRequestOnlyConfigStatement(kind, kindConfigName, kindCollectionName, methodName, MyService)
        
        const functionStatement = requestResponseConfig
          ? this.createRequestResponsePublishFunction(kindName)
          : this.createRequestOnlyPublishFunction(kindName)

        source.addStatement(cfgStatement)
        source.addStatement(functionStatement)
      }
      files.push(source)
    }
    return files
  }

  createRequestOnlyConfigStatement(
    kind: string,
    kindConfigName: string,
    kindCollectionName: string,
    methodName: string,
    service: string)
    : ts.VariableStatement 
  {
    return ts.createVariableStatement(
      [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.createVariableDeclarationList(
        [ts.createVariableDeclaration(
          ts.createIdentifier("config"),
          ts.createTypeReferenceNode(
            ts.createIdentifier(kindConfigName),
            [
              ts.createTypeReferenceNode(
                ts.createIdentifier("Params"),
                undefined
              )
            ]
          ),
          ts.createObjectLiteral(
            [
              ts.createPropertyAssignment(
                ts.createIdentifier(kind.toLowerCase()),
                ts.createPropertyAccess(
                  ts.createIdentifier(kindCollectionName),
                  ts.createIdentifier(methodName)
                )
              ),
              ts.createPropertyAssignment(
                kind === "EVENT"
                ? ts.createIdentifier("publisher")
                : ts.createIdentifier("subscriber"),
                ts.createPropertyAccess(
                  ts.createIdentifier("Services"),
                  ts.createIdentifier(service)
                )
              )
            ],
            true
          )
        )],
        ts.NodeFlags.Const
      )
    )
  }

  private createRequestResponseConfigStatement(
    kind: string,
    kindConfigName: string,
    kindCollectionName: string,
    methodName: string,
    service: string)
    : ts.VariableStatement 
  {
    return ts.createVariableStatement(
      [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.createVariableDeclarationList(
        [ts.createVariableDeclaration(
          ts.createIdentifier("config"),
          ts.createTypeReferenceNode(
            ts.createIdentifier(kindConfigName),
            [
              ts.createTypeReferenceNode(
                ts.createIdentifier("Params"),
                undefined
              ),
              ts.createTypeReferenceNode(
                ts.createIdentifier("Response"),
                undefined
              )
            ]
          ),
          ts.createObjectLiteral(
            [
              ts.createPropertyAssignment(
                ts.createIdentifier(kind.toLowerCase()),
                ts.createPropertyAccess(
                  ts.createIdentifier(kindCollectionName),
                  ts.createIdentifier(methodName)
                )
              ),
              ts.createPropertyAssignment(
                ts.createIdentifier("subscriber"),
                ts.createPropertyAccess(
                  ts.createIdentifier("Services"),
                  ts.createIdentifier(service)
                )
              )
            ],
            true
          )
        )],
        ts.NodeFlags.Const
      )
    )
  }

  private createRequestOnlyPublishFunction(kindName: string) : ts.FunctionDeclaration {
    return ts.createFunctionDeclaration(
      undefined,
      [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
      undefined,
      ts.createIdentifier("publish"),
      undefined,
      [
        ts.createParameter(
          undefined,
          undefined,
          undefined,
          ts.createIdentifier("qm"),
          undefined,
          ts.createTypeReferenceNode(
            ts.createIdentifier("QetaQueueManager"),
            undefined
          ),
          undefined
        ),
        ts.createParameter(
          undefined,
          undefined,
          undefined,
          ts.createIdentifier("params"),
          undefined,
          ts.createTypeReferenceNode(
            ts.createIdentifier("Params"),
            undefined
          ),
          undefined
        ),
        ts.createParameter(
          undefined,
          undefined,
          undefined,
          ts.createIdentifier("settings"),
          ts.createToken(ts.SyntaxKind.QuestionToken),
          ts.createTypeReferenceNode(
            ts.createIdentifier("MessagePublishSettings"),
            undefined
          ),
          undefined
        )
      ],
      ts.createTypeReferenceNode(
        ts.createIdentifier("Promise"),
        [ts.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)]
      ),
      ts.createBlock(
        [ts.createReturn(ts.createCall(
          ts.createPropertyAccess(
            ts.createIdentifier("qm"),
            ts.createIdentifier(`publish${kindName}`)
          ),
          undefined,
          [
            ts.createIdentifier("config"),
            ts.createIdentifier("params"),
            ts.createIdentifier("settings")
          ]
        ))],
        true
      )
    )
  }

  private createRequestResponsePublishFunction(kindName: string) : ts.FunctionDeclaration {
    return ts.createFunctionDeclaration(
      undefined,
      [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
      undefined,
      ts.createIdentifier("publish"),
      undefined,
      [
        ts.createParameter(
          undefined,
          undefined,
          undefined,
          ts.createIdentifier("qm"),
          undefined,
          ts.createTypeReferenceNode(
            ts.createIdentifier("QetaQueueManager"),
            undefined
          ),
          undefined
        ),
        ts.createParameter(
          undefined,
          undefined,
          undefined,
          ts.createIdentifier("params"),
          undefined,
          ts.createTypeReferenceNode(
            ts.createIdentifier("Params"),
            undefined
          ),
          undefined
        ),
        ts.createParameter(
          undefined,
          undefined,
          undefined,
          ts.createIdentifier("settings"),
          ts.createToken(ts.SyntaxKind.QuestionToken),
          ts.createTypeReferenceNode(
            ts.createIdentifier("MessagePublishSettings"),
            undefined
          ),
          undefined
        )
      ],
      ts.createTypeReferenceNode(
        ts.createIdentifier("Promise"),
        [ts.createTypeReferenceNode(
          ts.createIdentifier("Response"),
          undefined
        )]
      ),
      ts.createBlock(
        [ts.createReturn(ts.createCall(
          ts.createPropertyAccess(
            ts.createIdentifier("qm"),
            ts.createIdentifier(`publish${kindName}`)
          ),
          undefined,
          [
            ts.createIdentifier("config"),
            ts.createIdentifier("params"),
            ts.createIdentifier("settings")
          ]
        ))],
        true
      )
    )
  }

  private generateSubcriberConfigStatement(methodName: string, kind: string) : ts.VariableStatement {
    const configMethod = methodName[0].toLowerCase() + methodName.slice(1, methodName.length)
    return ts.createVariableStatement(
      undefined,
      ts.createVariableDeclarationList(
        [ts.createVariableDeclaration(
          ts.createIdentifier("config"),
          undefined,
          ts.createPropertyAccess(
            ts.createPropertyAccess(
              ts.createIdentifier(`${kind!.toLowerCase()}s`),
              ts.createIdentifier(`${configMethod}`)
            ),
            ts.createIdentifier("config")
          )
        )],
        ts.NodeFlags.Const
      )
    )
  }

  private generateSubcriberTypeReferenceStatement(name: string, methodName: string, propertyName: string, kind: string) : ts.TypeAliasDeclaration {
    const configMethod = methodName[0].toLowerCase() + methodName.slice(1, methodName.length)
    return ts.createTypeAliasDeclaration(
      undefined,
      undefined,
      ts.createIdentifier(`${name}`),
      undefined,
      ts.createTypeReferenceNode(
        ts.createQualifiedName(
          ts.createQualifiedName(
            ts.createIdentifier(`${kind!.toLowerCase()}s`),
            ts.createIdentifier(`${configMethod}`)
          ),
          ts.createIdentifier(`${propertyName}`)
        ),
        undefined
      )
    )
  }

  private generateSubscriberHandlerDeclaration(hasResponse: boolean) : ts.FunctionDeclaration {
    return ts.createFunctionDeclaration(
      undefined,
      [ts.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      ts.createIdentifier("handler"),
      undefined,
      [ts.createParameter(
        undefined,
        undefined,
        undefined,
        ts.createIdentifier("params"),
        undefined,
        ts.createTypeReferenceNode(
          ts.createIdentifier("Request"),
          undefined
        ),
        undefined
      )],
      ts.createTypeReferenceNode(
        ts.createIdentifier("Promise"),
        hasResponse 
        ? [ts.createTypeReferenceNode(
            ts.createIdentifier("Response"),
            undefined
          )]
        : [ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)]
      ),
      hasResponse 
      ? ts.createBlock(
          [
            ts.createVariableStatement(
              undefined,
              ts.createVariableDeclarationList(
                [ts.createVariableDeclaration(
                  ts.createIdentifier("response"),
                  ts.createTypeReferenceNode(
                    ts.createIdentifier("Response"),
                    undefined
                  ),
                  ts.createObjectLiteral(
                    [],
                    false
                  )
                )],
                ts.NodeFlags.Const | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
              )
            ),
            ts.createReturn(ts.createIdentifier("response"))
          ],
          true
        )
      : ts.createBlock(
        [],
        false
      )
    )
  }

  private generateExportSubscriberStatement(kind: string) : ts.ExportAssignment {
    const kindConfigName = kindConfigMap.get(kind)
    return ts.createExportAssignment(
      undefined,
      undefined,
      undefined,
      ts.createObjectLiteral(
        [
          ts.createPropertyAssignment(
            ts.createIdentifier(`${kind.toLowerCase()}Config`),
            ts.createIdentifier("config")
          ),
          ts.createPropertyAssignment(
            ts.createIdentifier(`on${kindConfigName}Received`),
            ts.createIdentifier("handler")
          )
        ],
        false
      )
    )    
  }

}
