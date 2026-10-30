import React, { useState } from "react";
import axios from "axios";

interface LoginPageProps {
  onLoginSuccess: (userId: number, username: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ loginId: "", password: "", username: "" });

  const handleSubmit = async () => {
    try {
      if (isRegister) {
        // --- [회원가입 로직] ---
        await axios.post("/api/login/register", form);
        alert("회원가입이 완료되었습니다! 이제 로그인해주세요.");
        setIsRegister(false);
        setForm({ loginId: "", password: "", username: "" }); 
      } else {
        // --- [로그인 로직] ---
        const response = await axios.post("/api/login", {
          loginId: form.loginId,
          password: form.password
        });
        const user = response.data;
        
        // 중요: 서버에서 주는 필드명이 username인지 확인하세요!
        // 만약 서버가 name으로 준다면 user.name으로 바꿔야 합니다.
        onLoginSuccess(user.userId, user.username);
      }
    } catch (error: any) {
      console.log("서버 데이터:", error.response?.data);
      let errorMessage = "요청 중 오류가 발생했습니다.";
      if (error.response) {
        errorMessage = typeof error.response.data === 'string' 
          ? error.response.data 
          : (error.response.data.message || "서버 내부 오류가 발생했습니다.");
      }
      alert(errorMessage);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#f0f2f5" }}>
      <div style={{ padding: "40px", background: "white", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", width: "350px" }}>
        <h2 style={{ textAlign: "center", color: "#1a73e8", marginBottom: "30px" }}>
          {isRegister ? "회원가입" : "Service Login"}
        </h2>

        {isRegister && (
          <input 
            type="text" 
            placeholder="이름" 
            value={form.username} // 👈 value 추가 (제어 컴포넌트)
            style={inputStyle}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        )}
        <input 
          type="text" 
          placeholder="아이디" 
          value={form.loginId} // 👈 value 추가
          style={inputStyle}
          onChange={(e) => setForm({ ...form, loginId: e.target.value })}
        />
        <input 
          type="password" 
          placeholder="비밀번호" 
          value={form.password} // 👈 value 추가
          style={inputStyle}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        <button onClick={handleSubmit} style={buttonStyle}>
          {isRegister ? "가입하기" : "로그인"}
        </button>

        <p 
          onClick={() => {
            setIsRegister(!isRegister);
            setForm({ loginId: "", password: "", username: "" }); // 전환 시 폼 초기화
          }} 
          style={{ textAlign: "center", marginTop: "15px", cursor: "pointer", color: "#5f6368", fontSize: "14px" }}
        >
          {isRegister ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
        </p>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "12px", marginBottom: "10px", borderRadius: "8px", border: "1px solid #ddd", boxSizing: "border-box" as "border-box" };
const buttonStyle = { width: "100%", padding: "14px", backgroundColor: "#1a73e8", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" as "bold" };