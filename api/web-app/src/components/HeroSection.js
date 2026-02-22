import React from 'react';
import styled, { keyframes } from 'styled-components';

const HeroSectionContainer = styled.section`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  text-align: center;
  padding: 2rem;
  overflow: hidden;

  &:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4));
    z-index: 0;
  }
`;

const FloatingBackground = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: url('/images/hero-background.jpg') center/cover no-repeat; /* Replace with your image path */
  filter: blur(5px);
  transform: scale(1.1);
  z-index: -1;
`;

const HeroTitle = styled.h1`
  font-size: 3rem;
  font-weight: 700;
  color: white;
  margin-bottom: 1rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  z-index: 1;
`;

const HeroSubtitle = styled.p`
  font-size: 1.5rem;
  color: white;
  margin-bottom: 2rem;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  z-index: 1;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 1rem;
  z-index: 1;
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Button = styled.a`
  display: inline-block;
  padding: 1rem 2rem;
  font-size: 1.2rem;
  font-weight: 600;
  color: white;
  text-decoration: none;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 0.5rem;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: background-color 0.3s ease, transform 0.2s ease;
  animation: ${fadeIn} 0.5s ease forwards;

  &:hover {
    background-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-3px);
  }
`;


const HeroSection = () => {
  return (
    <HeroSectionContainer>
      <FloatingBackground />
      <HeroTitle>Welcome to Our Awesome Platform</HeroTitle>
      <HeroSubtitle>
        Discover amazing features and supercharge your productivity.
      </HeroSubtitle>
      <ButtonContainer>
        <Button href="/signup">Get Started</Button>
        <Button href="/learn-more">Learn More</Button>
      </ButtonContainer>
    </HeroSectionContainer>
  );
};

export default HeroSection;