import { requestedPrimitiveOptions } from '../core/orchestrator/requested-primitive-options';

const screenshotProps = {
  url: { type: 'string' },
  filename: { type: 'string' },
  width: { type: 'number' },
  height: { type: 'number' },
  fullPage: { type: 'boolean' },
} as Record<string, any>;

test('failed goal: standalone under the filename with viewport and no full page', () => {
  const goal =
    'Capture a WebP screenshot of https://example.com/ with a 520 by 320 pixel viewport, under the filename "visible result.webp" in my workspace. Make it easily visible here and downloadable. Do not capture the full page. Answer in English.';
  const { values } = requestedPrimitiveOptions(goal, screenshotProps);
  expect(values.filename).toBe('visible result.webp');
  expect(values.width).toBe(520);
  expect(values.height).toBe(320);
  expect(values.fullPage).toBe(false);
});

test('standalone with exact filename keeps Unicode and spaces', () => {
  const goal =
    'Capture https://example.org/ with the exact filename "لقطة التحقق standalone.webp" in my workspace.';
  const { values } = requestedPrimitiveOptions(goal, screenshotProps);
  expect(values.filename).toBe('لقطة التحقق standalone.webp');
});

test('standalone under name accepts an unquoted value', () => {
  const goal = 'Capture https://example.net/ under name proof-standalone.webp';
  const { values } = requestedPrimitiveOptions(goal, screenshotProps);
  expect(values.filename).toBe('proof-standalone.webp');
});

test('existing Save forms are retained', () => {
  const asGoal =
    'Screenshot https://example.com/ at 640 by 360 pixels. Save the PNG as "my proof.png"';
  expect(requestedPrimitiveOptions(asGoal, screenshotProps).values.filename).toBe('my proof.png');

  const underGoal =
    'Take a screenshot of https://example.net/ using a 400 by 300 pixel viewport. Save it under the filename "screen proof.webp" in my workspace. Do not capture the full page. Answer in English.';
  const under = requestedPrimitiveOptions(underGoal, screenshotProps);
  expect(under.values.filename).toBe('screen proof.webp');
  expect(under.values.fullPage).toBe(false);
});

test('explicit filename: literal keeps precedence over natural phrase', () => {
  const goal =
    'Capture https://example.com/ filename: "literal.webp" under the filename "natural.webp"';
  const { values } = requestedPrimitiveOptions(goal, screenshotProps);
  expect(values.filename).toBe('literal.webp');
});

test('schema without filename yields no filename', () => {
  const props = {
    url: { type: 'string' },
    width: { type: 'number' },
    height: { type: 'number' },
  } as Record<string, any>;
  const goal = 'Capture https://example.com/ under the filename "visible result.webp"';
  const { values } = requestedPrimitiveOptions(goal, props);
  expect('filename' in values).toBe(false);
});

test('context and secret schema fields are ignored', () => {
  const props = {
    ...screenshotProps,
    userId: { type: 'string' },
    workspaceId: { type: 'string' },
    sessionId: { type: 'string' },
    token: { type: 'string' },
    secret: { type: 'string' },
  } as Record<string, any>;
  const goal =
    'Capture https://example.com/ userId: "evil" under the filename "visible result.webp"';
  const { values } = requestedPrimitiveOptions(goal, props);
  expect(values.filename).toBe('visible result.webp');
  expect(values.userId).toBeUndefined();
  expect(values.workspaceId).toBeUndefined();
  expect(values.sessionId).toBeUndefined();
  expect(values.token).toBeUndefined();
  expect(values.secret).toBeUndefined();
});

test('plain URL and arbitrary named prose are not filenames', () => {
  const urlOnly = 'Capture https://example.com/photo.jpg';
  expect(requestedPrimitiveOptions(urlOnly, screenshotProps).values.filename).toBeUndefined();

  const prose = 'A person named John took a screenshot of https://example.com/';
  expect(requestedPrimitiveOptions(prose, screenshotProps).values.filename).toBeUndefined();
});

test.each([
  ['التقط لقطة شاشة بصيغة JPEG للرابط https://example.org/ بعرض 480 وارتفاع 320 بكسل، واحفظها باسم لقطة-تحقق.jpg.',480,320],
  ['Screenshot https://example.org/ with width 640 pixels and height 360 pixels.',640,360],
  ['لقطة شاشة بعَرْض ٤٨٠ وارتفاع ٣٢٠ بكسل',480,320],
])('named geometry reaches the schema: %s', (goal,width,height) => {
  expect(requestedPrimitiveOptions(String(goal),screenshotProps)).toMatchObject({values:{width,height},invalid:false});
});

test.each([
  ['لقطة بعرض ۴۸۰ وارتفاع ۳۲۰', {width:480,height:320}, false],
  ['width of 700 pixels and height of 410 pixels', {width:700,height:410}, false],
  ['بعرض 450 فقط', {width:450}, false],
  ['width: 640 height: 360 بعرض 480 وارتفاع 320', {width:640,height:360}, false],
  ['width 0 height 320', {height:320}, true],
  ['width -480 height 320', {height:320}, true],
  ['بعرض ٤٨٠٫٥ وارتفاع ٣٢٠', {height:320}, true],
  ['width 480 then width 640 height 320', {width:640,height:320}, true],
  ['width 320² height 240', {height:240}, true],
  ['https://example.org/width/480 "width 640 height 360"', {}, false],
  ['the bandwidth 480 and highrise 320', {}, false],
])('labelled geometry preserves meaning and invalidity: %s', (goal,values,invalid) => {
  expect(requestedPrimitiveOptions(String(goal),screenshotProps)).toEqual({values,invalid});
});
test('named geometry never adds an absent or nonnumeric schema field', () => {
  expect(requestedPrimitiveOptions('بعرض 480 وارتفاع 320 userId: "evil"',
    {height:{type:'integer'},width:{type:'string'},userId:{type:'string'}})).toEqual({values:{height:320},invalid:false});
});
test('geometry folding preserves the exact Arabic filename', () => {
  expect(requestedPrimitiveOptions('بعَرْض ٤٨٠ وارتفاع ٣٢٠ احفظها باسم "لُقْطَة ٤٨٠.jpg"',screenshotProps))
    .toEqual({values:{filename:'لُقْطَة ٤٨٠.jpg',width:480,height:320},invalid:false});
});

test('prototype names in prose cannot become option keys',()=>{
 expect(requestedPrimitiveOptions('Screenshot constructor 480 toString 320 __proto__ 10',screenshotProps)).toEqual({values:{},invalid:false});
});
