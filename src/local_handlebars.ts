/// <reference path="../typings/tsd.d.ts" />

import _ = require('lodash');
import inflection = require('inflection');
import Handlebars = require('handlebars');
import Swag = require('swag');

function applyHelperToStringWithSeparator(str: string, helper: (str: string) => string): string {
  var separators = _.uniq(str.match(/[^a-z_]+/gi));

  if (separators.length === 1) {
    return str.split(separators[0]).map(s => helper(s)).join(separators[0]);
  } else {
    return helper(str);
  }
}

export module HandlebarsHelpers {
  export function underscore(str: string): string {
    return applyHelperToStringWithSeparator(str, inflection.underscore);
  }

  export function upperCamelCase(str: string): string {
    return applyHelperToStringWithSeparator(str, inflection.camelize);
  }

  export function lowerCamelCase(str: string): string {
    return applyHelperToStringWithSeparator(str, s => {
      return inflection.camelize(s, true);
    });
  }
}

export function registerHelpers(handlebars: typeof Handlebars): void {
  Swag.registerHelpers(handlebars);
  _.forEach(HandlebarsHelpers, (helper: Function, helperName: string) => {
    handlebars.registerHelper(helperName, helper);
  });
}

export var handlebars: typeof Handlebars = (<any>Handlebars).create();
registerHelpers(handlebars);
