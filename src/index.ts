import type { Plugin } from '@custom-elements-manifest/analyzer';
import type {
  CallExpression,
  ClassDeclaration,
  ClassElement,
  Decorator,
  Identifier,
  ObjectLiteralExpression,
  PropertyDeclaration,
  StringLiteral
} from 'typescript';
import type { Attribute, CustomElementDeclaration, Module, PropertyLike } from 'custom-elements-manifest';
import { toKebabCase } from './utils';

type TS = typeof import('typescript');

export function cmeAureliaPlugin(): Plugin {
  return {
    name: 'cme-aurelia-plugin',
    analyzePhase(args) {
      try {
        // @ts-ignore
        const ts = args.ts as TS;
        const node = (args.node as unknown) as ClassDeclaration;
        const moduleDoc = args.moduleDoc as Module;
        if (node.kind === ts.SyntaxKind.ClassDeclaration) {
          const customElementDecorator = getDecorator(node, '@customElement', ts);
          if (!customElementDecorator) {
            return;
          }
          const className = node.name!.getText();
          const tagName = resolveCustomElementName(className, customElementDecorator, ts);
          const classDeclaration = moduleDoc.declarations
            ?.find(declaration => declaration.name === className) as CustomElementDeclaration;

          if (!classDeclaration) {
            return;
          }
          classDeclaration.tagName = tagName;

          node.members?.forEach(member => {
            injectAttributeForProperty(member, classDeclaration, ts);
          });
        }
      } catch (e: unknown) {
        console.log(e);
      }
    }
  }
}

function injectAttributeForProperty(member: ClassElement, classDeclaration: CustomElementDeclaration, ts: TS): Attribute | undefined {
  if (member.kind === ts.SyntaxKind.PropertyDeclaration && getDecorator(member as PropertyDeclaration,'@bindable', ts)) {
    const propertyName = (member as PropertyDeclaration).name!.getText();
    const memberDeclaration: PropertyLike | undefined = classDeclaration.members?.find(m => m.name === propertyName);
    if (!memberDeclaration) {
      return;
    }
    classDeclaration.attributes = classDeclaration.attributes || [];
    const attribute: Attribute = {
      name: toKebabCase(propertyName),
      description: memberDeclaration?.description,
      type: memberDeclaration?.type ?? { text: 'any' },
    };
    if (memberDeclaration?.default) {
      attribute.default = memberDeclaration?.default;
    }
    classDeclaration.attributes.push(attribute);
  }
}

function resolveCustomElementName(className: string, decorator: Decorator, ts: TS) {
  let tagName = toKebabCase(className);
  if (decorator) {
    const expression = decorator.expression as CallExpression | Identifier;
    if (expression.kind === ts.SyntaxKind.CallExpression && expression.arguments.length > 0) {
      const arg = expression.arguments[0] as StringLiteral | ObjectLiteralExpression;

      // handle syntax @customElement('my-element')
      if (arg.kind === ts.SyntaxKind.StringLiteral) {
        tagName = arg.text;
      }
      // handle syntax @customElement({ name: 'my-element', ... })
      if (arg.kind === ts.SyntaxKind.ObjectLiteralExpression) {
        const properties = arg.properties;
        properties.forEach(property => {
          if (property.kind === ts.SyntaxKind.PropertyAssignment && property.name.getText() === 'name') {
            tagName = property.initializer.getText();
          }
        });
      }
    }
  }
  return tagName;
}

function getDecorator(node: ClassDeclaration | PropertyDeclaration, name: string, ts: TS): Decorator | undefined {
  return node.modifiers?.find(modifier => {
    if (modifier.kind === ts.SyntaxKind.Decorator) {
      return modifier.getText().startsWith(name);
    }
  }) as Decorator | undefined;
}
