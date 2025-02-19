import {assert} from "@chippercash/protobuf-runtime";
import * as ts from "typescript";
import * as path from "path";
import {GeneratedFile} from "./generated-file";
import {SymbolTable} from "./symbol-table";
import {AnyTypeDescriptorProto} from "./descriptor-info";
import {TypescriptFile} from "./typescript-file";


/** @deprecated */
export class TypescriptImportManager {

    private readonly file: GeneratedFile;
    private readonly symbols: SymbolTable;
    private readonly source: TypescriptFile;

    constructor(generatedFile: GeneratedFile, symbols: SymbolTable, source: TypescriptFile) {
        this.file = generatedFile;
        this.symbols = symbols;
        this.source = source;
    }

    /**
     * Import {importName} from "importFrom";
     *
     * Automatically finds a free name if the
     * `importName` would collide with another
     * identifier.
     *
     * Returns imported name.
     */
    name(importName: string, importFrom: string): string {
        const blackListedNames = this.symbols.list(this.file).map(e => e.name);
        return ensureNamedImportPresent(
            this.source.getSourceFile(),
            importName,
            importFrom,
            blackListedNames,
            statementToAdd => this.source.addStatement(statementToAdd, true)
        );
    }


    /**
     * Import * as importAs from "importFrom";
     *
     * Returns name for `importAs`.
     */
    namespace(importAs: string, importFrom: string): string {
        return ensureNamespaceImportPresent(
            this.source.getSourceFile(),
            importAs,
            importFrom,
            statementToAdd => this.source.addStatement(statementToAdd, true)
        );
    }


    /**
     * Import a previously registered identifier for a message
     * or other descriptor.
     *
     * Uses the symbol table to look for the type, adds an
     * import statement if necessary and automatically finds a
     * free name if the identifier would clash in this file.
     *
     * If you have multiple representations for a descriptor
     * in your generated code, use `kind` to discriminate.
     */
    type(descriptor: AnyTypeDescriptorProto, kind = 'default'): string {
        const symbolReg = this.symbols.get(descriptor, kind);

        // symbol in this file?
        if (symbolReg.file === this.file) {
            return symbolReg.name;
        }

        // symbol not in file
        // add an import statement
        const importPath = createRelativeImportPath(
            this.source.getSourceFile().fileName,
            symbolReg.file.getFilename()
        );
        const blackListedNames = this.symbols.list(this.file).map(e => e.name);
        return ensureNamedImportPresent(
            this.source.getSourceFile(),
            symbolReg.name,
            importPath,
            blackListedNames,
            statementToAdd => this.source.addStatement(statementToAdd, true)
        );
    }


}


/**
 * Import * as asName from "importFrom";
 *
 * If the import is already present, just return the
 * identifier.
 *
 * If the import is not present, create the import
 * statement and call `addStatementFn`.
 *
 * Does *not* check for collisions.
 */
function ensureNamespaceImportPresent(
    currentFile: ts.SourceFile,
    asName: string,
    importFrom: string,
    addStatementFn: (statementToAdd: ts.ImportDeclaration) => void,
): string {
    const
        all = findNamespaceImports(currentFile),
        match = all.find(ni => ni.as === asName && ni.from === importFrom);
    if (match) {
        return match.as;
    }
    const statementToAdd = createNamespaceImport(asName, importFrom);
    addStatementFn(statementToAdd);
    return asName;
}

/**
 * import * as <asName> from "<importFrom>";
 */
function createNamespaceImport(asName: string, importFrom: string) {
    return ts.createImportDeclaration(
        undefined,
        undefined,
        ts.createImportClause(
            undefined,
            ts.createNamespaceImport(ts.createIdentifier(asName))
        ),
        ts.createStringLiteral(importFrom)
    );
}

/**
 * import * as <as> from "<from>";
 */
function findNamespaceImports(sourceFile: ts.SourceFile): { as: string, from: string }[] {
    let r: Array<{ as: string, from: string }> = [];
    for (let s of sourceFile.statements) {
        if (ts.isImportDeclaration(s) && s.importClause) {
            let namedBindings = s.importClause.namedBindings;
            if (namedBindings && ts.isNamespaceImport(namedBindings)) {
                assert(ts.isStringLiteral(s.moduleSpecifier));
                r.push({
                    as: namedBindings.name.escapedText.toString(),
                    from: s.moduleSpecifier.text
                });
            }
        }
    }
    return r;
}

/**
 * Import {importName} from "importFrom";
 *
 * If the import is already present, just return the
 * identifier.
 *
 * If the import is not present, create the import
 * statement and call `addStatementFn`.
 *
 * If the import name is taken by another named import
 * or is in the list of blacklisted names, an
 * alternative name is used:
 *
 * Import {importName as alternativeName} from "importFrom";
 *
 * Returns the imported name or the alternative name.
 */
function ensureNamedImportPresent(
    currentFile: ts.SourceFile,
    importName: string,
    importFrom: string,
    blacklistedNames: string[],
    addStatementFn: (statementToAdd: ts.ImportDeclaration) => void,
    escapeCharacter = '$'
): string {
    const
        all = findNamedImports(currentFile),
        taken = all.map(ni => ni.as ?? ni.name).concat(blacklistedNames),
        match = all.find(ni => ni.name === importName && ni.from === importFrom);
    if (match) {
        return match.as ?? match.name;
    }
    let as: string | undefined;
    if (taken.includes(importName)) {
        let i = 0;
        as = importName;
        while (taken.includes(as)) {
            as = importName + escapeCharacter;
            if (i++ > 0) {
                as += i;
            }
        }
    }
    const statementToAdd = createNamedImport(importName, importFrom, as);
    addStatementFn(statementToAdd);
    return as ?? importName;
}

/**
 * import {<name>} from '<from>';
 * import {<name> as <as>} from '<from>';
 */
function createNamedImport(name: string, from: string, as?: string): ts.ImportDeclaration {
    if (as) {
        return ts.createImportDeclaration(
            undefined,
            undefined,
            ts.createImportClause(
                undefined,
                ts.createNamedImports([ts.createImportSpecifier(
                    ts.createIdentifier(name),
                    ts.createIdentifier(as)
                )]),
                false
            ),
            ts.createStringLiteral(from)
        );
    }
    return ts.createImportDeclaration(
        undefined,
        undefined,
        ts.createImportClause(
            undefined,
            ts.createNamedImports([
                ts.createImportSpecifier(
                    undefined,
                    ts.createIdentifier(name)
                )
            ])
        ),
        ts.createStringLiteral(from)
    );
}

/**
 * import {<name>} from '<from>';
 * import {<name> as <as>} from '<from>';
 */
function findNamedImports(sourceFile: ts.SourceFile): { name: string, as: string | undefined, from: string }[] {
    let r: Array<{ name: string, as: string | undefined, from: string }> = [];
    for (let s of sourceFile.statements) {
        if (ts.isImportDeclaration(s) && s.importClause) {
            let namedBindings = s.importClause.namedBindings;
            if (namedBindings && ts.isNamedImports(namedBindings)) {
                for (let importSpecifier of namedBindings.elements) {
                    assert(ts.isStringLiteral(s.moduleSpecifier));
                    if (importSpecifier.propertyName) {
                        r.push({
                            name: importSpecifier.propertyName.escapedText.toString(),
                            as: importSpecifier.name.escapedText.toString(),
                            from: s.moduleSpecifier.text
                        })
                    } else {
                        r.push({
                            name: importSpecifier.name.escapedText.toString(),
                            as: undefined,
                            from: s.moduleSpecifier.text
                        })
                    }
                }
            }
        }
    }
    return r;
}

/**
 * Create a relative path for an import statement like
 * `import {Foo} from "./foo"`
 */
function createRelativeImportPath(currentPath: string, pathToImportFrom: string): string {
    // create relative path to the file to import
    let fromPath = path.relative(path.dirname(currentPath), pathToImportFrom);

    // on windows, this may add backslash directory separators.
    // we replace them with forward slash.
    if (path.sep !== "/") {
        fromPath = fromPath.split(path.sep).join("/");
    }

    // drop file extension
    fromPath = fromPath.replace(/\.[a-z]+$/, '');

    // make sure to start with './' to signal relative path to module resolution
    if (!fromPath.startsWith('../') && !fromPath.startsWith('./')) {
        fromPath = './' + fromPath;
    }
    return fromPath;
}
