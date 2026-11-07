import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {import.meta.env.VITE_ATLAS_LAB === "true" && (
      <div role="status" style={{
        position:"fixed",bottom:8,right:8,zIndex:10000,
        padding:"8px 12px",background:"#322912",color:"#fff",
        border:"2px solid #e7b852",borderRadius:8,
        fontWeight:700,fontSize:12,boxShadow:"0 2px 8px #0006"
      }}>
        ATLAS LABORATORIO · DATOS FICTICIOS · NO PRODUCCION
      </div>
    )}
    <App />
  </React.StrictMode>
);
