const defaultStyles = {
    fontSize: '14px',
    font: "'Lucida Console', monospace",
    space: '25px',
    space_from_left: '50px',
    links: true,
    colors: {
      background: 'black',
      keys: '#d54e50',
      values: {
        number: '#FF8811',
        string: '#b9ba1f',
        boolean: '#EDA2F2',
        function: '#FFC43D',
        undefined: '#06D6A0',
        null: '#B3B7EE',
        other: '#FFC43D',
        curly_brace: '#FFFFFF',
        square_brace: '#FFFFFF',
        comma_colon_quotes: '#FFFFFF',
      },
    },
    comments: {
      show: true,
      color: 'gray',
      space_from_left: '35px',
    },
    retractors: {
      show: true,
      color: '#8c8c8c',
      space_from_left: '37px',
    },
    line_numbers: {
      show: true,
      color: '#5c749c',
      space_from_left: '30px',
    },
    bracket_pair_lines: {
      show: true,
      color: '#3c3c3c',
      space_from_left: '6px',
      type: 'solid',
    },
  };
  
  let num = 0;
  const tags = {
    div: (data, style) => `<div ${style ? `style="${style}"` : ''}>${data}</div>`,
    span: (data, style) => `<span ${style ? `style="${style}"` : ''}>${data}</span>`,
    comment: (data, styles) =>
      styles.comments.show
        ? `<i style="
      color:${styles.comments.color};
      position:absolute;
      margin-left:${styles.comments.space_from_left};
      width:${data.length}ch;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      -khtml-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
      ">${data}</i>`
        : '',
    br: () => `<br>`,
    code: (data, styles, style) => `<pre style="
      margin: 0 0 0 0;
      display:inline;
      color:${styles.colors.values.function};
      "><code style="
      font-family:${styles.font};
      ${style || ''}
      ">${data}</code></pre>`,
    number: (styles, style) =>
      styles.line_numbers.show
        ? `<span style="
      position:absolute;
      left:${styles.line_numbers.space_from_left};
      color:${styles.line_numbers.color};
      background:${styles.colors.background};
      font-size:calc(${styles.fontSize} - 1px);
      translate: -100% 1px;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      -khtml-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
        ${style || ''}"
        >${++num}</span>`
        : '',
    curlyBrace: (data, styles) => `<span style="
      color:${styles.colors.values.curly_brace}
      ">${data}</span>`,
    squareBrace: (data, styles) => `<span style="
      color:${styles.colors.values.square_brace}
      ">${data}</span>`,
    comma_colon_quotes: (data, styles) => `<span style="
      color:${styles.colors.values.comma_colon_quotes};
      ${data === ':' && 'margin-right:3px;'}
      ">${data}</span>`,
    closeButton: (styles) =>
      styles.retractors.show
        ? `<button style="
          color:${styles.retractors.color};
          position:absolute;
          left:${styles.retractors.space_from_left};
          translate:0 -${styles.fontSize};
          background: ${styles.colors.background};
            border: none;
            padding: 0;
            outline: inherit;
          overflow: hidden;
          font-size: ${styles.fontSize};
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          -khtml-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          "
          onclick="(function(e){
            const entries = e.target.parentElement.querySelector('div');
            if(entries.style.display === 'block' || entries.style.display === ''){
              entries.style.display = 'none';
              e.target.parentElement.style.display = 'inline-block'
              e.target.innerText = '▾';
            }else {
              entries.style.display = 'block';
              e.target.parentElement.style.display = 'block'
              e.target.innerText = '▴';
            }
          return false;
          })(arguments[0]);return false;">▴</button>`
        : '',
  };
  const parseOperations = {
    object: (data, styles) => {
      if (Object.entries(data).length === 0) return tags.number(styles) + tags.curlyBrace('{}', styles);
      const html = tags.number(styles) + tags.curlyBrace('{', styles);
      let values = '';
      const keys = Object.keys(data);
  
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = data[key];
  
        const isLastItem = i === keys.length - 1;
  
        values +=
          (!(value instanceof Object) || value instanceof Array ? tags.number(styles) : '') +
          tags.div(
            tags.comma_colon_quotes('"', styles) +
              tags.span(key, `color:${styles.colors.keys};`) +
              tags.comma_colon_quotes('"', styles) +
              tags.comma_colon_quotes(':', styles) +
              parseJson(value, styles) +
              (isLastItem ? '' : tags.comma_colon_quotes(',', styles)),
            `padding-left:${styles.space}`,
          );
      }
      return (
        html +
        tags.div(
          tags.closeButton(styles) + tags.div(values),
          `${
            styles.bracket_pair_lines.show
              ? `margin-left:${styles.bracket_pair_lines.space_from_left};
              border-left:1px ${styles.bracket_pair_lines.type} ${styles.bracket_pair_lines.color};`
              : ''
          }`,
        ) +
        tags.number(styles) +
        tags.curlyBrace('}', styles) +
        tags.comment(` // ${Object.entries(data).length} entries`, styles)
      );
    },
    array: (data, styles) => {
      if (data.length === 0) {
        return tags.squareBrace('[]', styles);
      }
      let html = '';
      const values = Object.values(data);
      const totalValues = values.length;
  
      for (let i = 0; i < totalValues; i++) {
        const value = values[i];
        const isLastValue = i === totalValues - 1;
  
        html += tags.div(
          parseJson(value, styles, true) + (isLastValue ? '' : tags.comma_colon_quotes(',', styles)),
          `padding-left:${styles.space};`,
        );
      }
      return (
        tags.squareBrace('[', styles) +
        tags.div(
          tags.closeButton(styles) + tags.div(html),
          `${
            styles.bracket_pair_lines.show
              ? `margin-left:${styles.bracket_pair_lines.space_from_left};
              border-left:1px ${styles.bracket_pair_lines.type} ${styles.bracket_pair_lines.color};`
              : ''
          }`,
        ) +
        tags.number(styles) +
        tags.squareBrace(']', styles) +
        tags.comment(` // ${data.length} elements`, styles)
      );
    },
    string: (data, styles) => {
      return tags.span(`"${data}"`, `color:${styles.colors.values.string};`);
    },
    number: (data, styles) => {
      return tags.span(`${data}`, `color:${styles.colors.values.number};`);
    },
    boolean: (data, styles) => {
      return tags.span(`${data}`, `color:${styles.colors.values.boolean};`);
    },
    undefined: (styles) => {
      return tags.span('undefined', `color:${styles.colors.values.undefined};`);
    },
    function: (data, styles) => {
      return tags.code(data, styles);
    },
    null: (styles) => {
      return tags.span('null', `color:${styles.colors.values.null};`);
    },
    other: (data, styles) => {
      return tags.div(JSON.stringify(data), `color:${styles.colors.values.function}`);
    },
  };
  const parseJson = (data, styles, addNumber) => {
    if (typeof data === 'object' && data instanceof Object && !(data instanceof Array))
      return parseOperations.object(data, styles);
    else if (typeof data === 'object' && data instanceof Array) {
      const html = `${num === 0 || addNumber ? tags.number(styles) : ''}` + parseOperations.array(data, styles);
      return html;
    } else if (typeof data === 'string') {
      const html = `${num === 0 ? tags.number(styles) : ''}` + parseOperations.string(data, styles);
      return html;
    } else if (typeof data === 'object' && JSON.stringify(data) === 'null') {
      const html = `${num === 0 ? tags.number(styles) : ''}` + parseOperations.null(styles);
      return html;
    } else if (typeof data === 'number') {
      const html = `${num === 0 ? tags.number(styles) : ''}` + parseOperations.number(data, styles);
      return html;
    } else if (typeof data === 'boolean') {
      const html = `${num === 0 ? tags.number(styles) : ''}` + parseOperations.boolean(data, styles);
      return html;
    } else if (typeof data === 'undefined') {
      const html = `${num === 0 ? tags.number(styles) : ''}` + parseOperations.undefined(styles);
      return html;
    } else if (typeof data === 'function') {
      const html = `${num === 0 ? tags.number(styles) : ''}` + parseOperations.function(data, styles);
      return html;
    }
    return parseOperations.other(data, styles);
  };
  function jsontohtml(data, options) {
    num = 0;
    const styles = Object.assign(Object.assign(Object.assign({}, defaultStyles), options), {
      colors: Object.assign(
        Object.assign({}, defaultStyles.colors),
        options === null || options === void 0 ? void 0 : options.colors,
      ),
      comments: Object.assign(
        Object.assign({}, defaultStyles.comments),
        options === null || options === void 0 ? void 0 : options.comments,
      ),
      line_numbers: Object.assign(
        Object.assign({}, defaultStyles.line_numbers),
        options === null || options === void 0 ? void 0 : options.line_numbers,
      ),
      retractors: Object.assign(
        Object.assign({}, defaultStyles.retractors),
        options === null || options === void 0 ? void 0 : options.retractors,
      ),
      bracket_pair_lines: Object.assign(
        Object.assign({}, defaultStyles.bracket_pair_lines),
        options === null || options === void 0 ? void 0 : options.bracket_pair_lines,
      ),
    });
    styles.retractors.space_from_left = styles.retractors.show ? styles.retractors.space_from_left : '0px';
    styles.line_numbers.space_from_left = styles.line_numbers.show ? styles.line_numbers.space_from_left : '0px';
    styles.bracket_pair_lines.space_from_left = styles.bracket_pair_lines.show
      ? styles.bracket_pair_lines.space_from_left
      : '0px';
    return `
    <div style="
    position:relative;
    min-width:max-content;
    line-height:calc(${styles.fontSize} + 2px);
    padding-left:${styles.space_from_left};
    background:${styles.colors.background};
    font-size:${styles.fontSize} !important;
    ${styles.font ? `font-family:${styles.font}` : ''}
    ">
    ${parseJson(data, styles)}
    </div>
    `.replace(
      /(https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*))/g,
      `${
        styles.links ? `<a target="_blank" style='color:#3891ff; text-decoration:"underline";' href="$1">$1</a>` : '$1'
      }`,
    );
  }
  // exports.jsontohtml = jsontohtml;