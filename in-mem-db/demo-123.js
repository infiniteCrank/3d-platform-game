//this executes the sql light code on load 
document.addEventListener('DOMContentLoaded', function() {
    runDbExample()
}, false);

/*
  2022-09-19

  The author disclaims copyright to this source code.  In place of a
  legal notice, here is a blessing:

  *   May you do good and not evil.
  *   May you find forgiveness for yourself and forgive others.
  *   May you share freely, never taking more than you give.

  ***********************************************************************

  A basic demonstration of the SQLite3 "OO#1" API.
*/

function runDbExample(){
  /**
     Set up our output channel differently depending
     on whether we are running in a worker thread or
     the main (UI) thread.
  */
  let logHtml;
  if(globalThis.window === globalThis /* UI thread */){
    console.log("Running demo from main UI thread.");
    logHtml = function(cssClass,...args){
      const ln = document.createElement('div');
      if(cssClass) ln.classList.add(cssClass);
      ln.append(document.createTextNode(args.join(' ')));
      document.body.append(ln)
    };
  }else{ /* Worker thread */
    console.log("Running demo from Worker thread.");
    logHtml = function(cssClass,...args){
      postMessage({
        type:'log',
        payload:{cssClass, args}
      });
    };
  }
  const log = (...args)=>logHtml('',...args);
  const warn = (...args)=>logHtml('warning',...args);
  const error = (...args)=>logHtml('error',...args);

  const demo1 = async function(sqlite3){
    
    const capi = sqlite3.capi/*C-style API*/,
          oo = sqlite3.oo1/*Object Oriented API #1 (a.k.a. oo1) */;
    log("sqlite3 version",capi.sqlite3_libversion(), capi.sqlite3_sourceid());
      
    // The DB class is the core database class
    //  new DB([filename=':memory:' [, flags='c' [, vfs]]])
    //    Creates a connection to the given file, optionally creating it if needed.
    //  new DB(object)
    //    A more flexible form which is "future-proofed" for the addition of further flags.
    //    For the second form, the object may contain any of:
    //    {
    //        filename: db filename,
    //        flags: open-mode flags,
    //        vfs: name of the sqlite3_vfs to use,
    //        (SEE flag - see below (added in v3.46))
    //    }
    // this is to load a new db
    // const db = new oo.DB("/testSuiteDB.sqlite",'ct');
    // log("transient db =",db.filename);
    const db = new oo.DB();
    await fetch('http://localhost:8000/testSuiteDB.sqlite')
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => {
        const bytes = new Uint8Array(arrayBuffer);
        // takes Int8Array, Uint8Array, or ArrayBuffer: wasm.allocFromTypedArray() is used to convert the memory to the WASM heap
        const p = sqlite3.wasm.allocFromTypedArray(bytes);
        db.onclose = {after: function(){sqlite3.wasm.dealloc(p)}};
        // sqlite3_deserialize() does not materially differ from its C-side counterpart 
        // but does have subtle caveats regarding memory allocation
        // int sqlite3_deserialize(
        //   sqlite3 *db,            /* The database connection */
        //   const char *zSchema,    /* Which DB to reopen with the deserialization */
        //   unsigned char *pData,   /* The serialized database content */
        //   sqlite3_int64 szDb,     /* Number bytes in the deserialization */
        //   sqlite3_int64 szBuf,    /* Total size of buffer pData[] */
        //   unsigned mFlags         /* Zero or more SQLITE_DESERIALIZE_* flags */
        // );
        const rc = capi.sqlite3_deserialize(
          db.pointer, 'main', p, bytes.length, bytes.length,
          0
          // The above zero means no options other possibilities are
          // sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
          // Optionally:
          // | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
        );
        db.checkRc(rc);
      });

    /**
       Never(!) rely on garbage collection to clean up DBs and
       (especially) prepared statements. Always wrap their lifetimes
       in a try/finally construct, as demonstrated below. By and
       large, client code can entirely avoid lifetime-related
       complications of prepared statement objects by using the
       DB.exec() method for SQL execution.
    */
    try {

      db.exec({
        sql: "SELECT DISTINCT name FROM tag",
        rowMode: 'array', // 'array' (default), 'object', or 'stmt'
        callback: function(row){
          log("row ",++this.counter,"=",row);
        }.bind({counter: 0})
      });
    //   log("Create a table...");
    //   db.exec("CREATE TABLE IF NOT EXISTS t(a,b)");
    //   //Equivalent:
    //   db.exec({
    //     sql:"CREATE TABLE IF NOT EXISTS t(a,b)"
    //     // ... numerous other options ... 
    //   });
    //   // SQL can be either a string or a byte array
    //   // or an array of strings which get concatenated
    //   // together as-is (so be sure to end each statement
    //   // with a semicolon).

    //   log("Insert some data using exec()...");
    //   let i;
    //   for( i = 20; i <= 25; ++i ){
    //     db.exec({
    //       sql: "insert into t(a,b) values (?,?)",
    //       // bind by parameter index...
    //       bind: [i, i*2]
    //     });
    //     db.exec({
    //       sql: "insert into t(a,b) values ($a,$b)",
    //       // bind by parameter name...
    //       bind: {$a: i * 10, $b: i * 20}
    //     });
    //   }    

    //   log("Insert using a prepared statement...");
    //   let q = db.prepare([
    //     // SQL may be a string or array of strings
    //     // (concatenated w/o separators).
    //     "insert into t(a,b) ",
    //     "values(?,?)"
    //   ]);
    //   try {
    //     for( i = 100; i < 103; ++i ){
    //       q.bind( [i, i*2] ).step();
    //       q.reset();
    //     }
    //     // Equivalent...
    //     for( i = 103; i <= 105; ++i ){
    //       q.bind(1, i).bind(2, i*2).stepReset();
    //     }
    //   }finally{
    //     q.finalize();
    //   }

    //   log("Query data with exec() using rowMode 'array'...");
    //   db.exec({
    //     sql: "select a from t order by a limit 3",
    //     rowMode: 'array', // 'array' (default), 'object', or 'stmt'
    //     callback: function(row){
    //       log("row ",++this.counter,"=",row);
    //     }.bind({counter: 0})
    //   });

    //   log("Query data with exec() using rowMode 'object'...");
    //   db.exec({
    //     sql: "select a as aa, b as bb from t order by aa limit 3",
    //     rowMode: 'object',
    //     callback: function(row){
    //       log("row ",++this.counter,"=",JSON.stringify(row));
    //     }.bind({counter: 0})
    //   });

    //   log("Query data with exec() using rowMode 'stmt'...");
    //   db.exec({
    //     sql: "select a from t order by a limit 3",
    //     rowMode: 'stmt',
    //     callback: function(row){
    //       log("row ",++this.counter,"get(0) =",row.get(0));
    //     }.bind({counter: 0})
    //   });

    //   log("Query data with exec() using rowMode INTEGER (result column index)...");
    //   db.exec({
    //     sql: "select a, b from t order by a limit 3",
    //     rowMode: 1, // === result column 1
    //     callback: function(row){
    //       log("row ",++this.counter,"b =",row);
    //     }.bind({counter: 0})
    //   });

    //   log("Query data with exec() using rowMode $COLNAME (result column name)...");
    //   db.exec({
    //     sql: "select a a, b from t order by a limit 3",
    //     rowMode: '$a',
    //     callback: function(value){
    //       log("row ",++this.counter,"a =",value);
    //     }.bind({counter: 0})
    //   });

    //   log("Query data with exec() without a callback...");
    //   let resultRows = [];
    //   db.exec({
    //     sql: "select a, b from t order by a limit 3",
    //     rowMode: 'object',
    //     resultRows: resultRows
    //   });
    //   log("Result rows:",JSON.stringify(resultRows,undefined,2));

    //   log("Create a scalar UDF...");
    //   db.createFunction({
    //     name: 'twice',
    //     xFunc: function(pCx, arg){ // note the call arg count
    //       return arg + arg;
    //     }
    //   });
    //   log("Run scalar UDF and collect result column names...");
    //   let columnNames = [];
    //   db.exec({
    //     sql: "select a, twice(a), twice(''||a) from t order by a desc limit 3",
    //     columnNames: columnNames,
    //     rowMode: 'stmt',
    //     callback: function(row){
    //       log("a =",row.get(0), "twice(a) =", row.get(1),
    //           "twice(''||a) =",row.get(2));
    //     }
    //   });
    //   log("Result column names:",columnNames);

    //   try{
    //     log("The following use of the twice() UDF will",
    //         "fail because of incorrect arg count...");
    //     db.exec("select twice(1,2,3)");
    //   }catch(e){
    //     warn("Got expected exception:",e.message);
    //   }

    //   try {
    //     db.transaction( function(D) {
    //       D.exec("delete from t");
    //       log("In transaction: count(*) from t =",db.selectValue("select count(*) from t"));
    //       throw new sqlite3.SQLite3Error("Demonstrating transaction() rollback");
    //     });
    //   }catch(e){
    //     if(e instanceof sqlite3.SQLite3Error){
    //       log("Got expected exception from db.transaction():",e.message);
    //       log("count(*) from t =",db.selectValue("select count(*) from t"));
    //     }else{
    //       throw e;
    //     }
    //   }

    //   try {
    //     db.savepoint( function(D) {
    //       D.exec("delete from t");
    //       log("In savepoint: count(*) from t =",db.selectValue("select count(*) from t"));
    //       D.savepoint(function(DD){
    //         const rows = [];
    //         DD.exec({
    //           sql: ["insert into t(a,b) values(99,100);",
    //                 "select count(*) from t"],
    //           rowMode: 0,
    //           resultRows: rows
    //         });
    //         log("In nested savepoint. Row count =",rows[0]);
    //         throw new sqlite3.SQLite3Error("Demonstrating nested savepoint() rollback");
    //       })
    //     });
    //   }catch(e){
    //     if(e instanceof sqlite3.SQLite3Error){
    //       log("Got expected exception from nested db.savepoint():",e.message);
    //       log("count(*) from t =",db.selectValue("select count(*) from t"));
    //     }else{
    //       throw e;
    //     }
    //   }
    }finally{
      db.close();
    }

    log("That's all, folks!");

    /**
       Some of the features of the OO API not demonstrated above...

       - get change count (total or statement-local, 32- or 64-bit)
       - get a DB's file name

       Misc. Stmt features:

       - Various forms of bind()
       - clearBindings()
       - reset()
       - Various forms of step()
       - Variants of get() for explicit type treatment/conversion,
         e.g. getInt(), getFloat(), getBlob(), getJSON()
       - getColumnName(ndx), getColumnNames()
       - getParamIndex(name)
    */
  }/*demo1()*/;

  log("Loading and initializing sqlite3 module...");
  if(globalThis.window!==globalThis) /*worker thread*/{
    /*
      If sqlite3.js is in a directory other than this script, in order
      to get sqlite3.js to resolve sqlite3.wasm properly, we have to
      explicitly tell it where sqlite3.js is being loaded from. We do
      that by passing the `sqlite3.dir=theDirName` URL argument to
      _this_ script. That URL argument will be seen by the JS/WASM
      loader and it will adjust the sqlite3.wasm path accordingly. If
      sqlite3.js/.wasm are in the same directory as this script then
      that's not needed.

      URL arguments passed as part of the filename via importScripts()
      are simply lost, and such scripts see the globalThis.location of
      _this_ script.
    */
    let sqlite3Js = 'sqlite3.js';
    const urlParams = new URL(globalThis.location.href).searchParams;
    if(urlParams.has('sqlite3.dir')){
      sqlite3Js = urlParams.get('sqlite3.dir') + '/' + sqlite3Js;
    }
    importScripts(sqlite3Js);
  }
  globalThis.sqlite3InitModule({
    /* We can redirect any stdout/stderr from the module like so, but
       note that doing so makes use of Emscripten-isms, not
       well-defined sqlite APIs. */
    print: log,
    printErr: error
  }).then(function(sqlite3){
    //console.log('sqlite3 =',sqlite3);
    log("Done initializing. Running demo...");
    try {
      demo1(sqlite3);
    }catch(e){
      error("Exception:",e.message);
    }
  });
}
