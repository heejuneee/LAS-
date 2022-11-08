/*
 *   Steps
 *
 *   0. 서버에서 nodejs 호출 (fileInfPk)
 *   1. 본문 텍스트 전체를 읽는다.
 *   2. 페이지의 시작과 끝을 읽어서 페이지를 파싱하고 
 *   3. 데이터 영역을 파악한다.
 *   4. SST, STD, RST 를 파싱한다. 파싱하면서 라인(Ln)/위치(Col) 정보도 파싱한다.
 *   5. FIX 영역을 파악하고, 데이터를 파싱한다.
 *   6. json schema 를 통해 유효성을 확인한다.
 *   7. 파싱결과를 저장한다.
 */

const Ajv = require('ajv');
const { generatePostData, generateURLData, fetch, jsonToQueryString, format } = require('./utils/common');
const { API, apiInfo } = require('./utils/app.json')

let ajv = new Ajv({ strict: false });
let schema;

const { argv } = require('yargs/yargs')(process.argv.slice(2)).boolean(['isTest']);
console.log(argv);

let { devPk, fileInfPk, userId, comCd, hostname, port, lang, lxExecPk, isTest } = argv;
if (typeof devPk == 'undefined') {
    devPk = 126; // 26
}
console.log('devPk ', devPk);
if (typeof fileInfPk == 'undefined') {
    fileInfPk = 7457; // 1011
}
console.log('fileInfPk ', fileInfPk);
if (typeof userId == 'undefined') {
    userId = apiInfo.reportId;
}
console.log('userId ', userId);
if (typeof comCd == 'undefined') {
	comCd = '0003';
}
console.log('comCd ', comCd);
if (typeof lang == 'undefined') {
	lang = apiInfo.lang;
}
console.log('lang ', lang);
if (typeof lxExecPk == 'undefined') {
    lxExecPk = 0;
}
console.log('lxExecPk ', lxExecPk);
if (typeof isTest == 'undefined') {
    isTest = true;
}
console.log('isTest ', isTest);

let fileDiv;

let keyValue = {
    key: ''
    , value: ''
    , unit: ''
}
let keyValue2 = {
    key: ''
    ,value: ''
    ,unit: ''
}

let item = {
    number: 0
    , Ln: -1
    , Col: -1
    , text: ''
    , search: {}
    , items: []
    , isDataStart: false
    , isDataEnd: false
    , isSeq: false
    , isSST: false
    , isSTD: false
    , isRST: false
    , isFIX: false
    , isSummary: false
    , isFIELD: false
    , isFieldProperty: false
    , isTableData: false
    , isTableProperty: false
    , isDATA: false
    , isEndPoints: false
    , isResults: false
    , isProperty: false
    , isExternal: false
    , isAlias: false
};
let mappings = {
    items: []
};


// 1.
const stepOne = (devPk, fileInfPk) => {
    return new Promise(async (resolve, reject) => {
        console.log('stepOne');
        try {
	        let postData = await generatePostData({
	            devPk
	            , fileInfPk
	            , comCd
	            , userId
	            , hostname
	            , port
	            , lang
	        })
            if (!postData || postData.status >= 400) {
                return reject(postData);
            }
	        let options = generateURLData({
	            path: API.LAS.reportFileData.URL + '?' + jsonToQueryString(postData, true)
	            , method: API.LAS.reportFileData.METHOD
	            , hostname
	            , port
	            , lang
	        })
	        let { responseJSON } = await fetch(null, options);
	        if (responseJSON.status >= 400) {
	            // 파싱 에러로 처리
	            reject(responseJSON);
	        }
	        else {
                if (responseJSON.error) {
                    reject(responseJSON);
                }
                else {
                    let error;
                    if (responseJSON.data) {
                        if (responseJSON.data.content) {
                            if (isTest) {
                                console.log(responseJSON.data.content);
                            }
                            fileDiv = responseJSON.data.fileDiv;
                            schema = JSON.parse(responseJSON.data.parsRuleData);
                            resolve(responseJSON.data);
                        }
                        else {
                            error = `Can't parse empty file`;
                            reject({
                                error
                            })
                        }
                    }
                    else {
                        error = `Can't read file`;
                        if (responseJSON.msg) {
                            error = responseJSON.msg;
                        }
                        else if (responseJSON.error) {
                            error = responseJSON.error;
                        }
                        reject({
                            error
                        })
                    }
                }
            }
        } catch (error) {
            reject(error);
        }
    });
}
// 2.
const stepTwo = ({ content, orgFileNm }) => {
    return new Promise(async (resolve, reject) => {
        console.log('stepTwo');
        try {
            // 결과 
            let pages = [];
            // page
            let fstLine = {};
            let lstLine = {
                cond1: /\r\n/,
            };
            let pageNumber = 1;
            let lineNumber = 1;
            let data;
            switch (fileDiv) {
                case 'pdf':
                    break;
                case 'csv':
                    
                    break;
                case 'txt':
                default:
                    // raw content
                    break;
            }
            // line 파싱
            data = content.split('\n');
            data.forEach(line => {
                let isParsed = false;
                if (!line.trim()) {
                    let emptyLine = Object.assign({}, item);
                    emptyLine.number = pageNumber;
                    emptyLine.Ln = lineNumber;
                    emptyLine.Col = 0;
                    pages.push(emptyLine);
                    isParsed = true;
                }
                let matches = line.match(lstLine.cond1);
                if (matches && matches.length) {
                    let lst = Object.assign({}, item);
                    lst.number = pageNumber;
                    lst.text = line.trim();
                    lst.Ln = lineNumber;
                    lst.Col = matches.index;
                    pages.push(lst);
                    pageNumber += 1;
                    lineNumber = 1;
                    isParsed = true;
                }
                if (!isParsed) {
                    let restLine = Object.assign({}, item);
                    restLine.number = pageNumber;
                    restLine.Ln = lineNumber;
                    restLine.Col = 0;
                    restLine.text = line.toString();
                    pages.push(restLine);
                    isParsed = true;
                }
                lineNumber += 1;
            });
            resolve(pages);
        } catch (error) {
            reject(error);
        }
    });
}
// 3.
const stepThree = (pages) => {
    return new Promise(async (resolve, reject) => {
        console.log('stepThree');
        try {
            switch (fileDiv) {
                case 'pdf':
                    break;
                case 'csv':
                    
                    break;
                case 'txt':
                default:
                    // raw content
                    break;
            }
            let FIELD_AREA = {
                cond1: /Torque Range+:/,
                cond2: /\r\n/,
            }
            let isStart = false;
            pages.forEach(page => {
                let matches = page.text.match(FIELD_AREA.cond1);
                if (matches && matches.length && !isStart) {
                    page.isDataStart = true,
                    isStart = true;
                    return;
                }
                if (isStart) {
                    matches = page.text.match(FIELD_AREA.cond2);
                    if (matches && matches.length) {
                        page.isFIELD = true;
                        isStart = false;
                        return;
                    }
                    if (page.text) {
                        page.isFIELD = true;
                    }
                }
            });
            let DATA_AREA = {
                cond1: /Torque Range+:/,
                cond2: /Report Generated By+: administrator/,
                cond3: /Run Time\(min\)+:/,
                cond4: /(-?[0-9\.]+)/,
                cond5: /\\ ([A-Za-z0-9]{6,})/,

            };
            isStart = false;
            let isSummary = false;
            pages.forEach((page, idx) => {
                let matches = page.text.match(DATA_AREA.cond1);
                if (matches && matches.length && !isStart) {
                    isStart = true;
                    return;
                }
                if (isStart) {
                    matches = page.text.match(DATA_AREA.cond2);
                    if (matches && matches.length) {
                        page.isDATA = false;
                        isStart = false;
                        return;
                    }
                    if (page.text) {
                        matches = page.text.match(DATA_AREA.cond3);
                        if (matches && matches.length) {
                            page.isDATA = true;
                        }
                        matches = page.text.match(DATA_AREA.cond4);
                        if (matches && matches.length) {
                            if (isSummary) {
                                page.isSummary = true;
                                isSummary = false;
                            } else {
                                page.isDATA = true;
                            }
                        }
                        matches = page.text.match(DATA_AREA.cond5);
                        if (matches && matches.length) {
                            page.isDATA = false;
                            page.isSummary = true;
                            isSummary = true;
                        }
                    }
                }
            });
            resolve(pages);
        } catch (error) {
            reject(error);
        }
    });
}
// 4.
const stepFour = (pages) => {
    return new Promise(async (resolve, reject) => {
        console.log('stepFour');
        try {
            switch (fileDiv) {
                case 'pdf':
                    break;
                case 'csv':
                    
                    break;
                case 'txt':
                default:
                    // raw content
                    break;
            }
            let FIX_PROPERTY = {
              
                SampleName: {
                    origin: 'BATCHNO' , //point 여기가 출력되는 부분
                    alias: 'BATCHNO', //point
                    isAlias: false,
                    isProperty: true,
                    isRST: true,
                    isFIX: true,
                    isHasValue: true,
                    cond1: /\\ ([A-Za-z0-9]{5,})/,
                    
                },
                Point: {
                    origin: 'Point',
                    alias: 'Point',
                    isAlias: false,
                    isProperty: true,
                    isRST: true,
                    isFIX: true,
                    isHasValue: true,
                    cond1: /(\d+)\d \d.\d. \d*.\d \d*.\d(\d+) [0-9]+/,
                    
                },
                Viscosity:{ //Viscosity 출력 부분
                    origin: 'Viscosity',
                    alias: 'Viscosity',
                    isAlias: false,
                    isProperty: true,
                    isRST: true,
                    isFIX: true,
                    isHasValue: true,
                    cond2: /(\d+)\d \d.\d. \d*.\d \d*.\d(\d+) [0-9]+/,
                }
            };
            let property;
            pages.forEach((page, idx) => {
                if (page.isFIELD) {
                    property = FIX_PROPERTY.SampleName;
                    let matches = page.text.match(property.cond1);
                    if (matches && matches.length) {
                        page.Col = matches.index;
                        let kv = Object.assign({}, keyValue);
                        kv.key = property.isAlias ? property.alias : property.origin;
                        kv.value = matches[1];
                        page.search = kv;
                        page.isProperty = property.isProperty;
                        page.isFIX = property.isFIX;
                        page.isRST = property.isRST;
                    }
                    property = FIX_PROPERTY.Point;
                    matches = page.text.match(property.cond1);
                    if (matches && matches.length) {
                        page.Col = matches.index;
                        let kv = Object.assign({}, keyValue);
                        kv.key = property.isAlias ? property.alias : property.origin;
                        kv.value =[[matches[1]],[matches[2]]];
                        page.search = kv;
                        page.isProperty = property.isProperty;
                        page.isFIX = property.isFIX;
                        page.isRST = property.isRST;
                      

                      
                    }
                    // property = FIX_PROPERTY.Viscosity;
                    // matches = page.text.match(property.cond2);
                    // if (matches && matches.length) {
                    //     page.Col = matches.index;
                    //     let kv = Object.assign({}, keyValue);
                    //     kv.key = property.isAlias ? property.alias : property.origin;
                    //     kv.value = [matches[1]];
                    //     page.search = kv;
                    //     page.isProperty = property.isProperty;
                    //     page.isFIX = property.isFIX;
                    //     page.isRST = property.isRST;
                    //     kv.lastIndex=0;
                        

                    // }
                    
                 
                   
                }
              

            });
            let DATA_PROPERTY = {
                SampleName: {
                    origin: 'BATCHNO' , //point 여기가 출력되는 부분
                    alias: 'BATCHNO', 
                    isAlias: false,
                    isProperty: true,
                    isRST: true,
                    isHasValue: true,
                    cond1: /\\ ([A-Za-z0-9]{6,7})/,
                },
                Point:{ //Viscosity 출력 부분
                    origin: 'Point ',
                    alias: 'Point',
                    isAlias: false,
                    isProperty: true,
                    isRST: false,
                    isHasValue: true,
                    cond1: /(\d+)\d{1} \d*[.]\d{2} /,
                    
                },
                Viscosity: {
                    origin: 'Viscosity',
                    alias: 'Viscosity',
                    isAlias: false,
                    isProperty: true,
                    isRST: false,
                    isHasValue: true,
                    cond1: / \d*[.]\d{1}(\d) [0-9]+/,
                },
               
            };
            let parseValue = (_PROPERTY, page, text, items) => {
                if (!Object.keys(_PROPERTY).length) {
                    return;
                }
                let firstKey = Object.keys(_PROPERTY)[0];
                let property = _PROPERTY[firstKey];
                let spliter = items.length ? ' ' : '';
                let searchedItems = items.map(row => row.search.value);
                let _text = text.toString();
                let matches = text.match(property.cond1);
                if (matches && matches.length) {
                    let datum = Object.assign({}, item)
                    datum.number = page.number;
                    datum.Ln = page.Ln;
                    datum.Col = (searchedItems.join(spliter)).length + matches.index;
                    datum.text = text.toString();
                    let kv = Object.assign({}, keyValue);
                    kv.key = property.isAlias ? property.alias : property.origin;
                    switch (property.type) {
                        case 'number':
                            kv.value = Number(matches[1]);
                            break;
                        default:
                            kv.value = matches[1] || '';
                            break;
                    }
                    kv.unit = matches[2] || '';
                    datum.search = kv;
                    datum.isRST = property.isRST;
                    items.push(datum);
                    _text = text.substring(matches[0].length + 1);
                }
                // else {
                //     let datum = Object.assign({}, item)
                //     datum.number = page.number;
                //     datum.Ln = page.Ln;
                //     datum.Col = page.Col;
                //     datum.text = text.toString();
                //     let kv = Object.assign({}, keyValue);
                //     kv.key = property.isAlias ? property.alias : property.origin;
                //     switch (property.type) {
                //         case 'number':
                //             kv.value = 0;
                //             break;
                //         default:
                //             kv.value = '';
                //             break;
                //     }
                //     datum.search = kv;
                //     items.push(datum);
                //     _text = text.toString();
                // }
                delete _PROPERTY[firstKey];
                parseValue(_PROPERTY, page, _text, items);
            };
            pages.forEach(page => {
                if (page.isDATA) {
                    let items = [];
                    let _PROPERTY = Object.assign({}, DATA_PROPERTY);
                    parseValue(_PROPERTY, page, page.text.toString(), items);
                    page.items = Object.assign([], items);
                }
            });
            resolve(pages);
        } catch (error) {
            reject(error);
        }
    });
}
//5.
const stepFive = (pages) => {
    return new Promise(async (resolve, reject) => {
        console.log('stepFive');
        try {
            switch (fileDiv) {
                case 'pdf':
                    break;
                case 'csv':
                    
                    break;
                case 'txt':
                default:
                    // raw content
                    break;
            }
            // let VIS_PROPERTY = {
            //     Viscosity:{ //Viscosity 출력 부분
            //         origin: 'Viscosity',
            //         alias: 'Viscosity',
            //         isAlias: false,
            //         isProperty: true,
            //         isRST: true,
            //         isFIX: true,
            //         isHasValue: true,
            //         cond1: /\d*[.]\d{1}(\d{5}) [0-9]+/,
            //     }
            // };
            // let property;
            // pages.forEach((page, idx) => {
            //     if (page.isFIELD) {
            //         property = VIS_PROPERTY.Viscosity;
            //         let matches = page.text.match(property.cond1);
            //         if (matches && matches.length) {
            //             page.Col = matches.index;
            //             let kv = Object.assign({}, keyValue);
            //             kv.key = property.isAlias ? property.alias : property.origin;
            //             kv.value = matches[1] || '';
            //             page.search = kv;
            //             page.isProperty = property.isProperty;
            //             page.isFIX = property.isFIX;
            //             page.isRST = property.isRST;
            //         }
            //     }

            // });
            // let DATA_PROPERTY = {
            //     SampleName: {
            //         origin: 'BATCHNO' , //point 여기가 출력되는 부분
            //         alias: 'BATCHNO', 
            //         isAlias: false,
            //         isProperty: true,
            //         isRST: true,
            //         isHasValue: true,
            //         cond1: /\\ ([A-Za-z0-9]{6,7})/,
            //     },
            // };
            // let parseValue = (_PROPERTY, page, text, items) => {
            //     if (!Object.keys(_PROPERTY).length) {
            //         return;
            //     }
            //     let firstKey = Object.keys(_PROPERTY)[0];
            //     let property = _PROPERTY[firstKey];
            //     let spliter = items.length ? ' ' : '';
            //     let searchedItems = items.map(row => row.search.value);
            //     let _text = text.toString();
            //     let matches = text.match(property.cond1);
            //     if (matches && matches.length) {
            //         let datum = Object.assign({}, item)
            //         datum.number = page.number;
            //         datum.Ln = page.Ln;
            //         datum.Col = (searchedItems.join(spliter)).length + matches.index;
            //         datum.text = text.toString();
            //         let kv = Object.assign({}, keyValue);
            //         kv.key = property.isAlias ? property.alias : property.origin;
            //         switch (property.type) {
            //             case 'number':
            //                 kv.value = Number(matches[1]);
            //                 break;
            //             default:
            //                 kv.value = matches[1] || '';
            //                 break;
            //         }
            //         kv.unit = matches[2] || '';
            //         datum.search = kv;
            //         datum.isRST = property.isRST;
            //         items.push(datum);
            //         _text = text.substring(matches[0].length + 1);
            //     }
            //     delete _PROPERTY[firstKey];
            //     parseValue(_PROPERTY, page, _text, items);
            // };
            // pages.forEach(page => {
            //     if (page.isDATA) {
            //         let items = [];
            //         let _PROPERTY = Object.assign({}, DATA_PROPERTY);
            //         parseValue(_PROPERTY, page, page.text.toString(), items);
            //         page.items = Object.assign([], items);
            //     }
            // });

            resolve(pages);
        } catch (error) {
            reject(error);
        }
    });
}
// 6.
const stepSix = (pages) => {
    return new Promise(async (resolve, reject) => {
        console.log('stepSix');
        try {
            let BATCHNO = pages.filter(page => page.isFIX)[0].search.value;
            const arr1 = pages.filter(page => page.isFIX)[1].search.value[0];
            const arr2 = pages.filter(page => page.isFIX)[2].search.value[0];
            const arr3 = pages.filter(page => page.isFIX)[3].search.value[0];
            const arr4 = pages.filter(page => page.isFIX)[4].search.value[0];
            const arr5 = pages.filter(page => page.isFIX)[5].search.value[0];
            const arr6 = pages.filter(page => page.isFIX)[6].search.value[0];
            const arr7 = pages.filter(page => page.isFIX)[7].search.value[0];
            const arr8 = pages.filter(page => page.isFIX)[8].search.value[0];
            const arr9 = pages.filter(page => page.isFIX)[9].search.value[0];
            const arr10= pages.filter(page => page.isFIX)[10].search.value[0];
            const arr11 = pages.filter(page => page.isFIX)[11].search.value[0];
            const Point = [...arr1,
                            ...arr2,
                            ...arr3,
                            ...arr4,
                            ...arr5,
                            ...arr6,
                            ...arr7,
                            ...arr8,
                            ...arr9,
                            ...arr10,
                            ...arr11
                            ];
           const arr12 = pages.filter(page => page.isFIX)[1].search.value[1];
           const arr13 = pages.filter(page => page.isFIX)[2].search.value[1];
           const arr14 = pages.filter(page => page.isFIX)[3].search.value[1];
           const arr15 = pages.filter(page => page.isFIX)[4].search.value[1];
           const arr16 = pages.filter(page => page.isFIX)[5].search.value[1];
           const arr17 = pages.filter(page => page.isFIX)[6].search.value[1];
           const arr18 = pages.filter(page => page.isFIX)[7].search.value[1];
           const arr19 = pages.filter(page => page.isFIX)[8].search.value[1];
           const arr20 = pages.filter(page => page.isFIX)[9].search.value[1];
           const arr21 = pages.filter(page => page.isFIX)[10].search.value[1];
           const arr22 = pages.filter(page => page.isFIX)[11].search.value[1];
           const Viscosity = [...arr12,
                             ...arr13,
                             ...arr14,
                             ...arr15,
                             ...arr16,
                             ...arr17,
                             ...arr18,
                             ...arr19,
                             ...arr20,
                             ...arr21,
                             ...arr22
                            
                        
                        ]
            

                       // kv.value = [matches[1]];
            // object 생성
            let resultObj = {
                SST: []
                , STD: []
                , RST: []
             
            };
            // let obj;``
            // let runCnt = 1;
            // let cnt = 0;
            // let avgObj;
            // let avgCnt = 0;
            // let avgcnt = 0;
                    // pages.forEach(page =>{
                    //     if(page.isRST){
                            let fixObj = {BATCHNO,Point,Viscosity};
                    resultObj.RST.push(fixObj);
                //     }
                // })
                    
             
                   
                    // fixObj[page.search.key] = page.search.value;
                 
              
                // if (page.isDATA) {
                //     let len = page.items.length;
                //     if (len) {
                //         if (len == 4) {
                //             obj = {};
                //             obj[`Run${runCnt}`] = {};
                //             // obj[`Run${runCnt}`][cnt] = {};
                //         }
                //         // else {
                //         //     cnt += 1;
                //         //     // obj[`Run${runCnt}`][cnt] = {};
                //         // }
                //         page.items.forEach((item, idx) => {
                //             if (len == 4 && idx == 0) {
                //                 return;
                //             }
                //             if (item.isRST) {
                //                 obj[`Run${runCnt}`][cnt] = item.search.value;
                //             }
                //         });
                //         if (len == 3) {
                //             if (runCnt > 1) {
                //                 resultObj.RST.push(obj);
                //             }
                //             runCnt += 1;
                //             cnt = 0;
                //         }
                //     }
                // }
                // if (page.isSummary) {
                //     if (!avgObj) {
                //         avgObj = {};
                //         avgObj.SampleName = {};
                //     }
                //     // if (!avgObj.Average[avgCnt]) {
                //     //     avgObj.Average[avgCnt] = {};
                //     // }
                //     // page.items.forEach((item, idx) => {
                //     //     if (item.isRST) {
                //     //         avgObj.SampleName[avgCnt] = item.search.value;
                //     //     }
                //     // });
                //     // if (avgCnt > 0) {
                //     //     resultObj.RST.push(avgObj);
                //     // }
                //     // avgCnt += 1;
                // }
           
            let valid = ajv.validate(schema, resultObj);
            if (valid) {
                if (!resultObj.RST) {
                    resultObj.RST = [];
                }
            }
            resultObj.mappings = Object.assign(mappings, schema.mappings || {});
            resolve({
                smplData: resultObj,
                parsData: resultObj,
                parsErrMsg: ajv.errors || '',
                parsYn: valid ? 'Y' : 'N'
            });
        } catch (error) {
            reject(error);
            parsErrMsg: ajv.errors
        }
    });

    
} 
// 7.
const stepSeven = (data) => {
    return new Promise(async (resolve, reject) => {
        console.log('stepSeven');
        try {
            let postData = await generatePostData({
                devPk
                , fileInfPk
                , parsYn: data.parsYn
                , isTest
                , smplData: JSON.stringify(data.smplData, null, 0) 
                , parsData: JSON.stringify(data.parsData, null, 0)
                , parsErrMsg: data.parsErrMsg
                , userId
                , comCd
                , lxExecPk
                , hostname
                , port
	            , lang
            });
            if (!postData || postData.status >= 400) {
                return reject(postData);
            }
            let options = generateURLData({
                path: API.LAS.saveParsData.URL
                , method: API.LAS.saveParsData.METHOD
                , hostname
                , port
	            , lang
            });
            let { responseJSON, responseText } = await fetch(postData, options);
            if (responseJSON.status >= 400) {
                // 파싱 에러로 처리
                reject(responseJSON);
            }
            else {
                try {
                    resolve();
                }
                catch (error) {
                    reject(error);
                }
            }
        }
        catch (error) {
            reject(error);
        }
    });
}
// step 실행
stepOne(devPk, fileInfPk)
	.then(data => stepTwo(data))
	.then(data => stepThree(data))
	.then(data => stepFour(data))
	.then(data => stepFive(data))
	.then(data => stepSix(data))
	.then(data => stepSeven(data))
    .then(data => {
        console.log('parsing end')
        process.exit(0);
    })
    .catch(async error => {
        console.log('error ', error)
        if (!isTest) {
            // 파싱 실패 처리: api 호출
            let parsErrMsg = error;
            if (error.error || error.message) {
            	if (typeof error == 'object') {
                    if (error.stack) {
                        parsErrMsg = JSON.stringify({
                            message: error.message
                            , devPk
                            , fileInfPk
                            , comCd
                        });
                    }
                    else {
                        parsErrMsg = JSON.stringify(error, null, 0);
                    }
            	}
            	else {
            		if (error.error) {
                		parsErrMsg = error.error;
            		}
            		else if (error.message) {
                		parsErrMsg = error.message;
            		}
            	}
            }
            else if (error.length) {
                parsErrMsg = JSON.stringify(error, null, 0);
            }
            else if (error.msg) {
                parsErrMsg = error.msg;
            }
            else {
            	parsErrMsg = 'unknown error';
            }
            let postData
            if (userId) {
                postData = await generatePostData({
                    parsErrMsg
                    , devPk
                    , fileInfPk
                    , parsYn: "N"
                    , comCd
                    , userId
                    , hostname
                    , port
    	            , lang
                });
            }
            if (!postData || postData.status >= 400) {
                postData = await generatePostData({
                    parsErrMsg
                    , devPk
                    , fileInfPk
                    , parsYn: "N"
                    , comCd
                    , userId: apiInfo.reportId
                    , hostname
                    , port
    	            , lang
                });
            }
            let options = generateURLData({
                path: API.LAS.saveParsData.URL
                , method: API.LAS.saveParsData.METHOD
                , hostname
                , port
	            , lang
            })
            let { responseJSON, responseText } = await fetch(postData, options);
            if (responseJSON.status >= 400) {
                console.log(responseJSON);
            }
            else {
                console.log(responseJSON);
            }
        }
        process.exit(1);
    })
