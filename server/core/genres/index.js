const genresText = require('./genresText.js');
const genres = [];
const nonfb2Genres = [];//костылики
let nonfb2 = false;//костылики

const sec2index = {};
const lines = genresText.split('\n').map(l => l.trim());

let index = 0;

let other;//прочее в конец
const names = new Set();

for (const line of lines) {
    if (line.indexOf('#nonfb2') == 0)
        nonfb2 = true;

    if (!line || line[0] == '#')
        continue;

    const p = line.indexOf(' ');
    const num = line.substring(0, p).trim().split('.');
    if (num.length < 2)
        continue;

    const section = `${num[0]}.${num[1]}`;
    if (section == '0.0')
        continue;

    let name = line.substring(p + 1).trim();

    if (!nonfb2) {
        if (num.length < 3) {//раздел
            if (section == '0.20') {//прочее
                other = {name, value: []};
            } else {
                if (sec2index[section] === undefined) {
                    if (!genres[index])
                        genres[index] = {name, value: []};
                    sec2index[section] = index;
                    index++;
                }
            }
        } else {//подраздел
            const n = name.split(';').map(l => l.trim());
            names.add(n[0]);

            if (section == '0.20') {//прочее
                other.value.push({name: n[1], value: n[0]});
            } else {
                const i = sec2index[section];
                if (i !== undefined) {
                    genres[i].value.push({name: n[1], value: n[0]});
                }
            }
        }
    } else {
        const n = name.split(';').map(l => l.trim());

        if (!names.has(n[0]))
            nonfb2Genres.push({name: n[1], value: n[0]});

        names.add(n[0]);
    }
}

if (other) {
    if (nonfb2Genres.length) {
        other.value = other.value.concat(nonfb2Genres);
    }

    genres.push(other);
}

//console.log(JSON.stringify(genres));

module.exports = genres;