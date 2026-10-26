'use strict';

// Bounded test-owned CDP keyboard transport. macOS native editor commands travel
// with their key event; they never call an application or DOM editing handler.
async function dispatchShortcutKey(combo, { platform, editable, send }) {
  const combos = { O:['o',79], S:['s',83], ShiftS:['s',83], Z:['z',90], Y:['y',89], A:['a',65], N:['n',78],
    ShiftZ:['z',90], '1':['1',49], '2':['2',50], '3':['3',51], '4':['4',52], '5':['5',53], '6':['6',54], '7':['7',55], '8':['8',56], F:['f',70], Escape:['Escape',27], Tab:['Tab',9], Backspace:['Backspace',8] };
  if (!Object.hasOwn(combos, combo) || typeof editable !== 'boolean' || typeof send !== 'function') throw Error('Bounded shortcut transport arguments required');
  if (combo === 'A' && !editable) throw Error('Select-all requires a current owned editable input');
  const primary = !['F','Escape','Tab','Backspace'].includes(combo), shift = combo.startsWith('Shift'), mac = platform === 'darwin';
  const modifier = mac ? {key:'Meta',code:'MetaLeft',windowsVirtualKeyCode:91} : {key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17};
  const flags = (primary ? (mac ? 4 : 2) : 0) | (shift ? 8 : 0), [key,vk] = combos[combo];
  const event = {key:shift ? key.toUpperCase() : key,code:/^[a-z]$/.test(key) ? 'Key'+key.toUpperCase() : /^[0-9]$/.test(key) ? 'Digit'+key : key,windowsVirtualKeyCode:vk,modifiers:flags};
  const commands = mac && editable ? (combo === 'A' ? ['selectAll'] : combo === 'Z' ? ['undo'] : []) : [];
  let dispatchError;
  try {
    if (primary) await send({...modifier,type:'rawKeyDown',modifiers:mac ? 4 : 2});
    if (shift) await send({key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,type:'rawKeyDown',modifiers:flags});
    await send({...event,type:'rawKeyDown',...(commands.length ? {commands} : {})});
  } catch (error) { dispatchError = error; }
  const releases = [{...event,type:'keyUp'},
    ...(shift ? [{key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,type:'keyUp',modifiers:primary ? (mac ? 4 : 2) : 0}] : []),
    ...(primary ? [{...modifier,type:'keyUp',modifiers:0}] : [])];
  for (const release of releases) {
    try { await send(release); } catch (error) { dispatchError ??= error; }
  }
  if (dispatchError) throw dispatchError;
}

module.exports = { dispatchShortcutKey };
