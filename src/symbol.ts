import * as _ from 'lodash';
import * as inflection from 'inflection';

import * as config from './config';

export enum SymbolKind {
  Invalid,
  Module,
  PrimitiveType,
  Enum,
  EnumMember,
  ObjectType,
  Interface,
  Class,
  Array,
  Function,
  TypeParameter,
  Tuple,
  UnionType,
  IntersectionType,
  StringLiteralType,
  Property,
  Method,
  Signature,
  Parameter,
  Variable,
  TypeAlias
}

export interface ObjectTable<T> {
  [name: string]: T;
}

export class Tag {
  constructor(
      public name: string,
      public value: string = '') {
  }

  get number(): number {
    let n = Number(this.value);
    return typeof n === 'number' ? n : 0;
  }

  get boolean(): boolean {
    return this.value !== 'false';
  }

  toString(): string {
    return this.value;
  }
}

export class DeclarationInfo {
  constructor(
      public fileName: string,
      public path: string,
      public fullText: string,
      public lineAndCharacterNumber: {
        line: number;
        character: number;
      }) {
  }

  toString(): string {
    return this.fileName +
      '(' + this.lineAndCharacterNumber.line + ',' +
      this.lineAndCharacterNumber.character + ')';
  }
}

export class Decorator {
  get name(): string {
    return this.decoratorFunction.name;
  }

  get parameters(): Parameter[] {
    return this.arguments.length > 0 ? this.decoratorFunction.callSignatures[0].parameters : [];
  }

  get arguments(): any[] {
    return <any[]>_.values(this.argumentTable);
  }

  constructor(
      public decoratorFunction: Function,
      public argumentTable: ObjectTable<any>) {
  }

  toString(): string {
    return this.name;
  }
}

export class TypePredicate {
  constructor(
      public type: Type,
      public thisType: Type,
      public parameter: Parameter) {
  }

  toString(): string {
    return this.parameter ?
      this.parameter.name + ' is ' + this.type.name :
      this.thisType.toString() + ' is ' + this.type.name;
  }
}

export class Symbol {
  private static tagPattern: RegExp = /^\s*@([^\s@]+)\s*([^\s@]*)\s*$/m;
  kind: SymbolKind = SymbolKind.Invalid;
  private isDestroyed: boolean = false;

  constructor(
      protected config: config.Config,
      public rawName: string,
      public docComment: string[],
      public declarationInfos: DeclarationInfo[],
      public decorators: Decorator[],
      public parentModule: Module,
      protected rawAssumedName: string) {
  }

  get name(): string {
    let name = _.isEmpty(this.assumedName) ? this.rawName : this.assumedName;
    return this.config.plugin.rename(this, name);
  }

  get assumedName(): string {
    return this.rawAssumedName;
  }

  get fullName(): string {
    if (this.parentModule === null) { return this.name; }
    return [this.namespace, this.name].join(this.config.plugin.namespaceSeparator);
  }

  get namespace(): string {
    return this.ancestorModules.map(s => s.name).join(this.config.plugin.namespaceSeparator);
  }

  get ancestorModules(): Module[] {
    return _.tap([], (results) => {
      let parentModule = this.parentModule;
      while (_.isObject(parentModule)) {
        results.push(parentModule);
        parentModule = parentModule.parentModule;
      }
    }).reverse();
  }

  get comment(): string {
    return this.docComment
      .filter(c => !Symbol.tagPattern.test(c))
      .join(this.config.plugin.newLine);
  }

  get tagTable(): ObjectTable<Tag> {
    return <ObjectTable<Tag>>_.reduce(this.docComment, (result, comment) => {
      let matches = comment.match(Symbol.tagPattern);
      if (matches != null) { result[matches[1]] = new Tag(matches[1], matches[2]); }
      return result;
    }, <ObjectTable<Tag>>{});
  }

  get tags(): Tag[] {
    return <Tag[]>_.values(this.tagTable);
  }

  get isAnonymous(): boolean { return this.rawName.length <= 0; }
  get isAnonymousType(): boolean { return this.isType && this.isAnonymous; }
  get isType(): boolean { return false; }
  get isGenericType(): boolean { return false; }
  get isGlobalModule(): boolean { return false; }

  get isModule(): boolean { return this.kind === SymbolKind.Module; }
  get isPrimitiveType(): boolean { return this.kind === SymbolKind.PrimitiveType; }
  get isEnum(): boolean { return this.kind === SymbolKind.Enum; }
  get isEnumMember(): boolean { return this.kind === SymbolKind.EnumMember; }
  get isObjectType(): boolean { return this.kind === SymbolKind.ObjectType; }
  get isInterface(): boolean { return this.kind === SymbolKind.Interface; }
  get isClass(): boolean { return this.kind === SymbolKind.Class; }
  get isArray(): boolean { return this.kind === SymbolKind.Array; }
  get isFunction(): boolean { return this.kind === SymbolKind.Function; }
  get isTypeParameter(): boolean { return this.kind === SymbolKind.TypeParameter; }
  get isTuple(): boolean { return this.kind === SymbolKind.Tuple; }
  get isUnionType(): boolean { return this.kind === SymbolKind.UnionType; }
  get isIntersectionType(): boolean { return this.kind === SymbolKind.IntersectionType; }
  get isStringLiteralType(): boolean { return this.kind === SymbolKind.StringLiteralType; }
  get isProperty(): boolean { return this.kind === SymbolKind.Property; }
  get isMethod(): boolean { return this.kind === SymbolKind.Method; }
  get isSignature(): boolean { return this.kind === SymbolKind.Signature; }
  get isParameter(): boolean { return this.kind === SymbolKind.Parameter; }
  get isVariable(): boolean { return this.kind === SymbolKind.Variable; }
  get isTypeAlias(): boolean { return this.kind === SymbolKind.TypeAlias; }

  get isGenerationTarget(): boolean {
    return this.declarationInfos.every(d => {
      let resolvedPath = this.config.env.resolvePath(d.path);
      return resolvedPath !== this.config.env.defaultLibFileName &&
        _.contains(resolvedPath, this.config.typingDirectory);
    });
  }

  toString(): string {
    return this.name;
  }

  validate(): void {
  }

  destroy(ok: boolean = false): void {
    if (!ok || this.isDestroyed) { return; }
    Object.keys(this).forEach((key) => {
      delete (<any>this)[key];
    });
    this.isDestroyed = true;
  }
}

export class Type extends Symbol {
  get isType(): boolean { return true; }
}

export class Module extends Symbol {
  kind: SymbolKind = SymbolKind.Module;

  isNamespaceModule: boolean = false;
  importedModuleTable: ObjectTable<Module> = {};
  importedTypeTable: ObjectTable<Type> = {};
  modules: Module[] = [];
  types: Type[] = [];
  anonymousTypes: Type[] = [];
  variables: Variable[] = [];
  typeAliases: TypeAlias[] = [];

  get enums(): Enum[] { return <Enum[]>this.types.filter(t => t.isEnum); }
  get functions(): Function[] { return <Function[]>this.types.filter(t => t.isFunction); }
  get interfaces(): Interface[] { return <Interface[]>this.types.filter(t => t.isInterface); }
  get classes(): Class[] { return <Class[]>this.types.filter(t => t.isClass); }

  get isGlobalModule(): boolean { return this.rawName === '' && this.parentModule === null; }

  get name(): string {
    let name = this.isGlobalModule ? 'Global' : this.rawName;

    if (/^['"']/.test(name)) {
      name = name.replace(/['"]/g, '').replace('\\', '/');
      name = this.config.env.resolvePath(name);
      name = this.config.env.relativePath(this.config.typingDirectory, name);
    }
    return this.config.plugin.rename(this, name);
  }

  get importedModules(): { name: string; module: Module }[] {
    return _.map(this.importedModuleTable, (v, k) => { return { name: k, module: v }; });
  }

  get importedTypes(): { name: string; type: Type }[] {
    return _.map(this.importedTypeTable, (v, k) => { return { name: k, type: v }; });
  }

  initialize(isNamespaceModule: boolean,
      importedModuleTable: ObjectTable<Module>, importedTypeTable: ObjectTable<Type>,
      modules: Module[], types: Type[], variables: Variable[], typeAliases: TypeAlias[]): Module {
    this.isNamespaceModule = isNamespaceModule;
    this.importedModuleTable = importedModuleTable;
    this.importedTypeTable = importedTypeTable;
    this.modules = modules;
    this.types = types;
    this.variables = variables;
    this.typeAliases = typeAliases;
    return this;
  }
}

export class PrimitiveType extends Type {
  kind: SymbolKind = SymbolKind.PrimitiveType;
  get isGenerationTarget(): boolean { return true; }

  initialize(rawName: string): PrimitiveType {
    this.rawName = rawName;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.any && this.rawName === 'any') {
      return 'Disallow the any type';
    }
  }
}

export class Enum extends Type {
  kind: SymbolKind = SymbolKind.Enum;

  members: EnumMember[] = [];
  isConst: boolean = false;

  initialize(members: EnumMember[], isConst: boolean): Enum {
    this.members = members;
    this.isConst = isConst;
    return this;
  }
}

export class EnumMember extends Symbol {
  kind: SymbolKind = SymbolKind.EnumMember;

  value: number;

  initialize(value: number): EnumMember {
    this.value = value;
    return this;
  }
}

export class Function extends Type {
  kind: SymbolKind = SymbolKind.Function;

  callSignatures: Signature[] = [];

  initialize(callSignatures: Signature[]): Function {
    this.callSignatures = callSignatures;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.overload && this.callSignatures.length > 1) {
      return 'Disallow the function overloading';
    } else if (this.config.plugin.disallow.anonymousFunction && this.isAnonymousType) {
      return 'Disallow the anonymous function';
    }
  }
}

export class ObjectType extends Type {
  kind: SymbolKind = SymbolKind.ObjectType;

  properties: Property[] = [];
  methods: Method[] = [];
  builtInSymbolMethods: Method[] = [];
  stringIndexType: Type = null;
  numberIndexType: Type = null;

  get ownProperties(): Property[] { return this.properties.filter(p => p.isOwn); }
  get ownMethods(): Method[] { return this.methods.filter(m => m.isOwn); }

  initialize(properties: Property[], methods: Method[], builtInSymbolMethods: Method[],
      stringIndexType: Type, numberIndexType: Type,
      ...forOverride: any[]): ObjectType {
    this.properties = properties;
    this.methods = methods;
    this.builtInSymbolMethods = builtInSymbolMethods;
    this.stringIndexType = stringIndexType;
    this.numberIndexType = numberIndexType;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.anonymousObject && this.isAnonymousType) {
      return 'Disallow the anonymous object';
    }
  }
}

export class TypeReference {
  get typeArguments(): Type[] { return this.rawTypeArguments.filter(t => _.isObject(t) && !t.isTypeParameter); }

  constructor(
      public typeParameters: TypeParameter[],
      private rawTypeArguments: Type[]) {
  }

  getTypeByTypeParameter(typeParameter: TypeParameter): Type {
    let index = this.typeParameters.indexOf(typeParameter);
    if (index < 0) { return null; }
    let type = this.rawTypeArguments[index];
    return _.isObject(type) && type.isTypeParameter ? null : type;
  }
}

export class Interface extends ObjectType {
  kind: SymbolKind = SymbolKind.Interface;

  constructorSignatures: Signature[] = [];
  callSignatures: Signature[] = [];
  baseTypes: Interface[] = [];
  typeReference: TypeReference;
  staticProperties: Property[] = [];
  staticMethods: Method[] = [];
  isAbstract: boolean = false;

  get isGenericType(): boolean { return this.typeParameters.length > 0; }
  get typeParameters(): Type[] { return this.typeReference.typeParameters; }
  get typeArguments(): Type[] { return this.typeReference.typeArguments; }

  get assumedName(): string {
    if (this.typeArguments.length === 0) { return ''; }

    return this.rawName + this.typeArguments.map((type, index) => {
      let prefix = index === 0 ? 'Of' : 'And';
      return prefix + inflection.classify(type.name);
    }).join('');
  }

  initialize(properties: Property[], methods: Method[], builtInSymbolMethods: Method[],
      stringIndexType: Type, numberIndexType: Type, constructorSignatures: Signature[],
      callSignatures: Signature[], baseTypes: Interface[], typeReference: TypeReference,
      staticProperties: Property[], staticMethods: Method[], isAbstract: boolean): Interface {
    super.initialize(properties, methods, builtInSymbolMethods, stringIndexType, numberIndexType);

    this.constructorSignatures = constructorSignatures;
    this.callSignatures = callSignatures;
    this.baseTypes = baseTypes;
    this.typeReference = typeReference;
    this.staticProperties = staticProperties;
    this.staticMethods = staticMethods;
    this.isAbstract = isAbstract;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.generics && this.isGenericType) {
      return 'Disallow the generics';
    } else if (this.config.plugin.disallow.overload && (this.callSignatures.length > 1 || this.constructorSignatures.length > 1)) {
      return 'Disallow the function overloading';
    }
  }
}

export class Class extends Interface {
  kind: SymbolKind = SymbolKind.Class;
}

export class Array extends Type {
  kind: SymbolKind = SymbolKind.Array;
  type: Type = null;

  get isGenerationTarget(): boolean { return true; }

  get assumedName(): string {
    if (this.type === null) { return this.rawName; }
    return this.type.name + '[]';
  }

  initialize(type: Type): Array {
    this.type = type;
    return this;
  }
}

export class TypeParameter extends Type {
  kind: SymbolKind = SymbolKind.TypeParameter;

  constraint: Type = null;

  initialize(constraint: Type): TypeParameter {
    this.constraint = constraint;
    return this;
  }
}

export class Tuple extends Type {
  kind: SymbolKind = SymbolKind.Tuple;

  types: Type[] = [];

  get assumedName(): string {
    return this.types.map(t => inflection.classify(t.name)).join('And') + 'Tuple';
  }

  initialize(types: Type[]): Tuple {
    this.types = types;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.tuple) {
      return 'Disallow the tuple type';
    }
  }
}

export class UnionType extends Type {
  kind: SymbolKind = SymbolKind.UnionType;

  types: Type[] = [];

  get assumedName(): string {
    return this.types.map(t => inflection.classify(t.name)).join('And') + 'UnionType';
  }

  initialize(types: Type[]): UnionType {
    this.types = types;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.unionType) {
      return 'Disallow the union type';
    }
  }
}

export class IntersectionType extends Type {
  kind: SymbolKind = SymbolKind.IntersectionType;

  types: Type[] = [];

  get assumedName(): string {
    return this.types.map(t => inflection.classify(t.name)).join('And') + 'IntersectionType';
  }

  initialize(types: Type[]): UnionType {
    this.types = types;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.intersectionType) {
      return 'Disallow the intersection type';
    }
  }
}

export class StringLiteralType extends Type {
  kind: SymbolKind = SymbolKind.StringLiteralType;

  text: string = '';

  get rawText(): string {
    return this.text.replace(/"/g, '');
  }

  get assumedName(): string {
    return this.text;
  }

  initialize(text: string): StringLiteralType {
    this.text = '"' + text + '"';
    return this;
  }
}

export class Property extends Symbol {
  kind: SymbolKind = SymbolKind.Property;

  type: Type = null;
  isOptional: boolean = false;
  isOwn: boolean = false;
  isProtected: boolean = false;

  initialize(type: Type, isOptional: boolean, isOwn: boolean, isProtected: boolean): Property {
    this.type = type;
    this.isOptional = isOptional;
    this.isOwn = isOwn;
    this.isProtected = isProtected;
    return this;
  }
}

export class Method extends Symbol {
  kind: SymbolKind = SymbolKind.Method;

  callSignatures: Signature[] = [];
  isOptional: boolean = false;
  isOwn: boolean = false;
  isProtected: boolean = false;
  isAbstract: boolean = false;

  initialize(callSignatures: Signature[], isOptional: boolean, isOwn: boolean,
      isProtected: boolean, isAbstract: boolean): Method {
    this.callSignatures = callSignatures;
    this.isOptional = isOptional;
    this.isOwn = isOwn;
    this.isProtected = isProtected;
    this.isAbstract = isAbstract;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.overload && this.callSignatures.length > 1) {
      return 'Disallow the function overloading';
    }
  }
}

export class Signature extends Symbol {
  kind: SymbolKind = SymbolKind.Signature;

  typeParameters: TypeParameter[] = [];
  parameters: Parameter[] = [];
  returnType: Type = null;
  typePredicate: TypePredicate = null;

  initialize(typeParameters: TypeParameter[], parameters: Parameter[],
      returnType: Type, typePredicate: TypePredicate): Signature {
    this.typeParameters = typeParameters;
    this.parameters = parameters;
    this.returnType = returnType;
    this.typePredicate = typePredicate;
    return this;
  }

  validate(): void | string {
    if (this.config.plugin.disallow.generics && this.typeParameters.length > 0) {
      return 'Disallow the generics';
    }
  }
}

export class Parameter extends Symbol {
  kind: SymbolKind = SymbolKind.Parameter;

  type: Type = null;
  isOptional: boolean = false;
  isVariadic: boolean = false;

  initialize(type: Type, isOptional: boolean, isVariadic: boolean): Parameter {
    this.type = type;
    this.isOptional = isOptional;
    this.isVariadic = isVariadic;
    return this;
  }
}

export class Variable extends Symbol {
  kind: SymbolKind = SymbolKind.Variable;

  type: Type = null;
  module: Module = null;
  isLet: boolean = false;
  isConst: boolean = false;

  initialize(type: Type, module: Module, isLet: boolean, isConst: boolean): Variable {
    this.type = type;
    this.module = module;
    this.isLet = isLet;
    this.isConst = isConst;
    return this;
  }
}

export class TypeAlias extends Symbol {
  kind: SymbolKind = SymbolKind.TypeAlias;

  type: Type = null;

  initialize(type: Type): TypeAlias {
    this.type = type;
    return this;
  }
}
