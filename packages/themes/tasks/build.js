/**
 * Copyright IBM Corp. 2015, 2018
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const { reporter } = require('@carbon/cli-reporter');
const fs = require('fs-extra');
const path = require('path');
const prettier = require('prettier');
const yaml = require('js-yaml');
const { formatTokenName, themes, tokens } = require('../lib');

const { colors: tokenColors } = tokens;

const FILE_BANNER = `// Code generated by @carbon/themes. DO NOT EDIT.
//
// Copyright IBM Corp. 2018, 2018
//
// This source code is licensed under the Apache-2.0 license found in the
// LICENSE file in the root directory of this source tree.
//
`;
const SCSS_DIR = path.resolve(__dirname, '../scss');
const METADATA_FILE = path.resolve(__dirname, '../metadata.yml');
const MIXINS_ENTRYPOINT = path.join(SCSS_DIR, '_mixins.scss');
const TOKENS_ENTRYPOINT = path.join(SCSS_DIR, '_tokens.scss');
const MAPS_ENTRYPOINT = path.join(SCSS_DIR, '_theme-maps.scss');

const defaultTheme = 'white';
const defaultThemeMapName = `$carbon--theme`;
const prettierOptions = {
  parser: 'scss',
  printWidth: 80,
  singleQuote: true,
  trailingComma: 'es5',
};

/**
 * Transform token names to formats expected by Sassdoc for descriptions and
 * aliases
 * @param {Object} - token metadata
 * @return {Object} token metadata
 */
function transformMetadata(metadata) {
  const namesRegEx = new RegExp(
    metadata.tokens.map(token => token.name).join('|'),
    'g'
  );

  const replaceMap = {};
  metadata.tokens.map(token => {
    replaceMap[token.name] = formatTokenName(token.name);
  });

  metadata.tokens.forEach((token, i) => {
    // interactive01 to `$interactive-01`
    if (token.role) {
      token.role.forEach((role, j) => {
        metadata.tokens[i].role[j] = role.replace(namesRegEx, match => {
          return '`$' + replaceMap[match] + '`';
        });
      });
    }

    // brand01 to brand-01
    if (token.alias) {
      token.alias = formatTokenName(token.alias);
    }
  });

  return metadata;
}

async function build() {
  reporter.info('Building scss files for themes...');

  let metadata = {};

  try {
    metadata = transformMetadata(
      yaml.safeLoad(fs.readFileSync(METADATA_FILE, 'utf8'))
    );
  } catch (e) {
    console.error(e);
  }

  // Create maps for each theme:
  // $carbon--theme--name: (
  //   token-name: token-value
  // ) !default;
  const themeMaps = Object.keys(themes)
    .map(name => {
      const theme = themes[name];
      let scssMap = `/// Carbon's ${name} color theme
/// @type Map
/// @access public
/// @group @carbon/themes
$carbon--theme--${name}: (\n`;

      for (const key of Object.keys(theme)) {
        const name = formatTokenName(key);
        const value = theme[key];
        scssMap += `  ${name}: ${value},`;
        scssMap += '\n';
      }

      scssMap += ') !default;';
      scssMap += '\n';

      return scssMap;
    })
    .join('\n');

  // Create carbon--theme mixin, takes a theme as input and assigns all theme
  // variables using the `!global` flag before resetting at the end of the
  // function block
  let themeMixin = `/// Define theme variables from a map of tokens
/// @access public
/// @param {Map} $theme [${defaultThemeMapName}] - Map of theme tokens
/// @content Pass in your custom declaration blocks to be used after the token maps set theming variables.
///
/// @example scss
///   // Default usage
///   @include carbon--theme();
///
///   // Alternate styling (not white theme)
///   @include carbon--theme($carbon--theme--g90) {
///     // declarations...
///   }
///
///   // Inline styling
///   @include carbon--theme($carbon--theme--g90) {
///     .my-dark-theme {
///       // declarations...
///     }
///   }
///
/// @group @carbon/themes
@mixin carbon--theme($theme: ${defaultThemeMapName}) {\n`;

  // Initialize variables in mixin with !default flag
  for (const token of tokenColors) {
    const name = formatTokenName(token);
    themeMixin += `    $${name}: map-get($theme, ${name}) !global;\n`;
  }

  // Content block
  themeMixin += '\n';
  themeMixin += '  @content;';
  themeMixin += '\n';

  // If block for default theme to reset mixin
  themeMixin += '\n';
  themeMixin += `  // Reset to default theme after apply in content`;
  themeMixin += '\n';
  themeMixin += `  @if $theme != ${defaultThemeMapName} {
    @include carbon--theme;
  }`;
  themeMixin += '\n';
  themeMixin += '}';

  // Files
  const mixinsFile = `${FILE_BANNER}
@import './theme-maps';

${themeMixin}`;

  let tokensFile = `${FILE_BANNER}
@import './theme-maps';\n\n`;

  const themeMapsFile = `${FILE_BANNER}
${themeMaps}

/// Carbon's default theme
/// @type Map
/// @access public
/// @alias carbon--theme--${defaultTheme}
/// @group @carbon/themes
${defaultThemeMapName}: $carbon--theme--${defaultTheme} !default;
`;

  for (const token of tokenColors) {
    const name = formatTokenName(token);

    const tokenData =
      (metadata.tokens &&
        metadata.tokens.find(tok => {
          return tok.name === token;
        })) ||
      {};

    tokensFile += tokenData.role
      ? `\n\n/// ${tokenData.role.join('; ')}\n`
      : `\n\n`;

    tokensFile += `/// @type Color
/// @access public
/// @group @carbon/themes`;

    tokensFile += tokenData.alias ? `\n/// @alias ${tokenData.alias}` : ``;

    tokensFile += tokenData.deprecated ? `\n/// @deprecated` : ``;

    tokensFile += `\n$${name}: map-get(${defaultThemeMapName}, ${name}) !default;\n`;
  }

  await fs.ensureDir(SCSS_DIR);
  await fs.writeFile(
    TOKENS_ENTRYPOINT,
    prettier.format(tokensFile, prettierOptions)
  );
  await fs.writeFile(
    MIXINS_ENTRYPOINT,
    prettier.format(mixinsFile, prettierOptions)
  );
  await fs.writeFile(
    MAPS_ENTRYPOINT,
    prettier.format(themeMapsFile, prettierOptions)
  );

  reporter.success('Done! 🎉');
}

build().catch(error => {
  console.error(error);
});
